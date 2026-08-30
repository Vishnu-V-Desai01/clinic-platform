// src/features/pharmacy/actions.ts
//
// CURAKIN Pharmacy — drug catalogue + inventory + prescription queue +
// dispensing + dashboard server actions, plus admin pharmacy-access
// management and dispense-and-bill (Chat C).
//
// ACCESS MODEL (Chat A): pharmacy_access is an admin-granted boolean on
// profiles, independent of role/staff_type. is_clinic_admin implies access
// (see am_i_pharmacy_user() in Postgres — every RLS policy and both
// dispensing RPCs already resolve through it). The app-layer gates below
// mirror that exactly: (profile.pharmacy_access || profile.is_clinic_admin).
//
// CATALOGUE vs INVENTORY: pharmacy_drugs (names/forms/strengths — no stock
// counts) stays readable by any doctor, needed for prescribing (Chat B).
// pharmacy_inventory, stock adjustments, and dispensations require
// pharmacy_access specifically — a doctor with no granted access can see
// WHAT exists but not HOW MUCH is in stock, and cannot dispense.
//
// CATALOGUE MATCHING (Chat B): prescriptions.drug_id is a nullable FK set
// when the doctor prescribes via the catalogue picker in the post-visit
// wizard. getPharmacyQueue prefers this FK match, falling back to
// case-insensitive name matching for legacy/free-text prescriptions.
//
// BILLING (Chat C): dispenseAndBillEncounter dispenses one or more
// prescription lines for a single encounter and creates ONE payment
// (payment_source='medicine') covering all of them, attributed to the
// ENCOUNTER'S PRESCRIBING DOCTOR (not the dispensing user). No approval
// workflow — payments insert directly as approval_status='approved'.
// getPharmacyQueue also returns unit_price_paise per line so the client can
// show a live subtotal before dispensing.
//
// PAYMENT COLLECTION (Chat C follow-up fix): medicine is paid at dispense —
// dispenseAndBillEncounter now also inserts a payment_collections row for
// the final (possibly discounted) amount, so the bill is marked paid
// immediately rather than sitting permanently unpaid. payment_method is a
// required field on the dispense form for this reason.
//
// AUTO-SEND (Chat C follow-up): clinics.auto_send_medicine_receipts controls
// whether the queued medicine_receipt WhatsApp message is sent automatically
// right after dispenseAndBillEncounter completes (default true), or left
// pending for a staff member to send manually from the Messages page
// (admin-toggleable via setAutoSendMedicineReceipts). Either way the
// message is always queued — auto-send only changes whether it's ALSO sent
// immediately. A failed auto-send is non-fatal: the dispense/bill stays
// committed and the message simply sits pending as the manual fallback.
//
// PHARMACY REJECTION (Chat C follow-up): rejectPrescription lets a pharmacy
// user decline to dispense a line (e.g. insufficient stock) via
// pharmacy_reject_prescription() (SECURITY DEFINER RPC) — a direct table
// update is blocked by prescriptions_update RLS, which requires
// role='doctor'. getPharmacyQueue excludes rejected rows via
// pharmacy_rejected_at IS NULL, the same anti-join pattern already used to
// exclude dispensed rows.
//
// PATIENT NAME LOOKUP (Chat C follow-up): patients has a RESTRICTIVE RLS
// policy (patients_doctor_sees_assigned_only) that ANDs against every
// permissive policy — meaning a doctor can only see patients assigned to
// them specifically, even though staff_select_patients grants clinic-wide
// access. This silently broke every patient-name join in this file for any
// patient not assigned to the currently logged-in doctor ("Unknown
// patient"). Fixed via pharmacy_lookup_patient_names() (SECURITY DEFINER),
// which bypasses that restriction in a narrow, gated, names-only way —
// mirroring pharmacy_dispense()'s existing bypass pattern rather than
// loosening the underlying table policy (which may be an intentional
// doctor-to-doctor need-to-know restriction elsewhere in the app).
//
// Dispensing goes through pharmacy_dispense() / pharmacy_cancel_dispensation()
// (SECURITY DEFINER RPCs) rather than direct table writes — atomic stock
// decrement, double-dispense guard. These actions never write to
// pharmacy_dispensations or pharmacy_inventory directly for a dispense/cancel.
//
// NOTE: prescriptions / encounters are pre-existing tables with their own
// RLS, NOT gated by pharmacy_enabled_for_my_clinic(). Reads that touch them
// check clinics.pharmacy_enabled explicitly via assertPharmacyEnabled().

"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireRole, type Profile } from "@/lib/supabase/profile";
import { todayIsoDateIst } from "./ist";
import {
  createDrugSchema,
  updateDrugSchema,
  setDrugActiveSchema,
  initializeInventorySchema,
  updateInventoryDetailsSchema,
  adjustStockSchema,
  inventoryFilterSchema,
  dispenseSchema,
  cancelDispensationSchema,
  rejectPrescriptionSchema,
  dispenseAndBillEncounterSchema,
  type CreateDrugInput,
  type UpdateDrugInput,
  type SetDrugActiveInput,
  type InitializeInventoryInput,
  type UpdateInventoryDetailsInput,
  type AdjustStockInput,
  type InventoryFilterInput,
  type DispenseInput,
  type CancelDispensationInput,
  type RejectPrescriptionInput,
  type DispenseAndBillEncounterInput,
} from "./schema";
import {
  PHARMACY_EXPIRING_SOON_WINDOW_DAYS,
  type PharmacyDrugRow,
  type PharmacyInventoryRow,
  type PharmacyInventoryItem,
  type PharmacyInventoryStatus,
  type PrescriptionQueueRow,
  type PharmacyQueueItem,
  type PharmacyDispensationRow,
  type PharmacyDispensedTodayItem,
  type PharmacyDashboardSummary,
} from "./types";
import { generateAndStoreMedicineReceipt } from "./document-storage";

// ---------------------------------------------------------------------------
// Shared types / helpers
// ---------------------------------------------------------------------------

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string; code?: string };

type DrugIdentityRow = { id: string; name: string; strength: string | null; form: string };

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

type PatientNameRpcRow = { id: string; first_name: string | null; last_name: string | null };

// Wraps pharmacy_lookup_patient_names() — the SECURITY DEFINER RPC that
// bypasses patients_doctor_sees_assigned_only (a RESTRICTIVE policy) so a
// pharmacy user can see any clinic patient's name, not just patients
// assigned to whichever doctor is currently logged in. Returns a Map for
// convenient lookup at call sites, same shape every caller already expects.
async function lookupPatientNames(
  supabase: SupabaseClient,
  patientIds: string[]
): Promise<{ ok: true; data: Map<string, string> } | { ok: false; error: string }> {
  if (patientIds.length === 0) {
    return { ok: true, data: new Map() };
  }

  const { data, error } = await supabase.rpc("pharmacy_lookup_patient_names", {
    p_patient_ids: patientIds,
  });

  if (error) {
    console.error("[pharmacy.lookupPatientNames]", error);
    return { ok: false, error: "Could not load patient details." };
  }

  const rows = (data ?? []) as PatientNameRpcRow[];
  const nameById = new Map<string, string>(
    rows.map((p) => [p.id, `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "Unknown patient"])
  );
  return { ok: true, data: nameById };
}

function computeInventoryStatus(
  inventory: PharmacyInventoryRow | null
): PharmacyInventoryStatus | "not_stocked" {
  if (!inventory) return "not_stocked";

  const today = todayIsoDateIst();

  if (inventory.expiry_date && inventory.expiry_date < today) {
    return "expired";
  }

  if (inventory.expiry_date) {
    const expiryMs = new Date(inventory.expiry_date + "T00:00:00Z").getTime();
    const todayMs = new Date(today + "T00:00:00Z").getTime();
    const daysUntilExpiry = Math.floor((expiryMs - todayMs) / (24 * 60 * 60 * 1000));
    if (daysUntilExpiry <= PHARMACY_EXPIRING_SOON_WINDOW_DAYS) {
      return "expiring_soon";
    }
  }

  if (
    inventory.reorder_threshold !== null &&
    inventory.quantity_on_hand <= inventory.reorder_threshold
  ) {
    return "low_stock";
  }

  return "ok";
}

type PharmacyGate = { clinicId: string } | { code: string; error: string };

// WRITE gate: manage catalogue/inventory, adjust stock, dispense. Mirrors
// am_i_pharmacy_user() in Postgres: pharmacy_access OR is_clinic_admin.
function assertPharmacyWriter(profile: Profile): PharmacyGate {
  if (!profile.clinic_id) {
    return { code: "PHARMACY_NO_CLINIC", error: "Your profile is not linked to a clinic." };
  }
  if (!(profile.pharmacy_access || profile.is_clinic_admin)) {
    return { code: "PHARMACY_ACCESS_NOT_GRANTED", error: "Pharmacy inventory access not provided." };
  }
  return { clinicId: profile.clinic_id };
}

// READ gate for inventory-level data (stock counts, dispensations, queue).
// Same rule as the writer gate. Catalogue-only reads (listDrugs) deliberately
// do NOT use this gate — they stay open to any doctor, enforced by RLS alone.
function assertPharmacyReader(profile: Profile): PharmacyGate {
  return assertPharmacyWriter(profile);
}

// Explicit check of clinics.pharmacy_enabled. Needed because prescriptions/
// patients/encounters aren't gated by pharmacy_enabled_for_my_clinic() in
// RLS, and because a silently RLS-filtered empty result is otherwise
// indistinguishable from "genuinely empty" or "no personal access" — each of
// those needs a different message to the person using the app.
async function assertPharmacyEnabled(
  supabase: SupabaseClient,
  clinicId: string
): Promise<{ ok: true } | { ok: false; code: string; error: string }> {
  const { data: clinic, error } = await supabase
    .from("clinics")
    .select("pharmacy_enabled")
    .eq("id", clinicId)
    .single()
    .returns<{ pharmacy_enabled: boolean }>();

  if (error || !clinic) {
    return { ok: false, code: "PHARMACY_CLINIC_CHECK_FAILED", error: "Could not verify clinic settings." };
  }
  if (!clinic.pharmacy_enabled) {
    return { ok: false, code: "PHARMACY_DISABLED", error: "The pharmacy module is not enabled for this clinic." };
  }
  return { ok: true };
}

function normalizeDrugName(name: string): string {
  return name.trim().toLowerCase();
}

// Splits a PHARMACY_* RPC exception message into a stable code + human detail.
function parsePharmacyRpcError(message: string): { code: string; detail: string } {
  const match = message.match(/^([A-Z_]+):\s*([\s\S]*)$/);
  if (match) {
    return { code: match[1], detail: match[2] };
  }
  return { code: "PHARMACY_UNKNOWN_ERROR", detail: message };
}

const PHARMACY_ERROR_MESSAGES: Record<string, string> = {
  PHARMACY_NO_CLINIC: "No clinic context found for your account.",
  PHARMACY_DISABLED: "The pharmacy module is not enabled for this clinic.",
  PHARMACY_FORBIDDEN: "Pharmacy inventory access not provided.",
  PHARMACY_BAD_QUANTITY: "Enter a valid quantity greater than zero.",
  PHARMACY_BAD_ACTOR: "Your profile could not be verified for this clinic.",
  PHARMACY_BAD_PATIENT: "This patient does not belong to your clinic.",
  PHARMACY_BAD_REASON: "A reason is required to reject a prescription.",
  PHARMACY_UNKNOWN_DRUG: "This drug was not found in the catalogue.",
  PHARMACY_INACTIVE_DRUG: "This drug has been removed from the catalogue.",
  PHARMACY_NO_INVENTORY: "No stock record exists for this drug yet. Add it to inventory first.",
  PHARMACY_INSUFFICIENT_STOCK: "Not enough stock on hand for this quantity.",
  PHARMACY_EXPIRED_STOCK: "This stock has expired. Confirm to dispense anyway.",
  PHARMACY_ALREADY_DISPENSED: "This prescription has already been dispensed.",
  PHARMACY_UNKNOWN_DISPENSATION: "Dispensation record not found.",
};

// =============================================================================
// DRUG CATALOGUE — stays doctor-visible (no pharmacy_access gate here).
// =============================================================================

export async function listDrugs(includeInactive = false): Promise<ActionResult<PharmacyDrugRow[]>> {
  const profile = await requireRole("doctor", "staff");

  if (!profile.clinic_id) {
    return { ok: false, error: "Your profile is not linked to a clinic." };
  }

  const supabase = createServerSupabaseClient();

  let query = supabase
    .from("pharmacy_drugs")
    .select("*")
    .eq("clinic_id", profile.clinic_id)
    .order("name", { ascending: true });

  if (!includeInactive) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query.returns<PharmacyDrugRow[]>();

  if (error) {
    console.error("[pharmacy.listDrugs]", error);
    return { ok: false, error: "Could not load the drug catalogue." };
  }

  return { ok: true, data: data ?? [] };
}

export async function createDrug(input: CreateDrugInput): Promise<ActionResult<PharmacyDrugRow>> {
  const profile = await requireRole("doctor", "staff");

  const gate = assertPharmacyWriter(profile);
  if ("error" in gate) {
    return { ok: false, code: gate.code, error: gate.error };
  }
  const { clinicId } = gate;

  const parsed = createDrugSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid drug details." };
  }
  const { name, generic_name, form, strength, unit } = parsed.data;

  const supabase = createServerSupabaseClient();

  const normalizedStrength = strength?.trim().toLowerCase() ?? "";
  const { data: existing, error: checkError } = await supabase
    .from("pharmacy_drugs")
    .select("id, name, strength, form")
    .eq("clinic_id", clinicId)
    .eq("is_active", true)
    .eq("form", form)
    .ilike("name", name.trim())
    .returns<DrugIdentityRow[]>();

  if (checkError) {
    console.error("[pharmacy.createDrug] duplicate check failed", checkError);
    return { ok: false, error: "Could not verify the catalogue before adding this drug." };
  }

  const duplicate = existing?.find(
    (row) => (row.strength?.trim().toLowerCase() ?? "") === normalizedStrength
  );

  if (duplicate) {
    return {
      ok: false,
      code: "DUPLICATE_DRUG",
      error: `"${name}" (${form}${strength ? `, ${strength}` : ""}) already exists in the catalogue.`,
    };
  }

  const { data, error } = await supabase
    .from("pharmacy_drugs")
    .insert({
      clinic_id: clinicId,
      name: name.trim(),
      generic_name: generic_name?.trim() || null,
      form,
      strength: strength?.trim() || null,
      unit: unit?.trim() || null,
    })
    .select("*")
    .single()
    .returns<PharmacyDrugRow>();

  if (error) {
    console.error("[pharmacy.createDrug]", error);
    return { ok: false, error: "Could not add the drug. It may already exist in the catalogue." };
  }

  revalidatePath("/dashboard/pharmacy");
  revalidatePath("/dashboard/pharmacy/inventory");
  return { ok: true, data: data as PharmacyDrugRow };
}

export async function updateDrug(input: UpdateDrugInput): Promise<ActionResult<PharmacyDrugRow>> {
  const profile = await requireRole("doctor", "staff");

  const gate = assertPharmacyWriter(profile);
  if ("error" in gate) {
    return { ok: false, code: gate.code, error: gate.error };
  }
  const { clinicId } = gate;

  const parsed = updateDrugSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid drug details." };
  }
  const { drug_id, name, generic_name, form, strength, unit } = parsed.data;

  const supabase = createServerSupabaseClient();

  if (name !== undefined || form !== undefined || strength !== undefined) {
    const { data: current, error: fetchError } = await supabase
      .from("pharmacy_drugs")
      .select("id, name, strength, form")
      .eq("id", drug_id)
      .eq("clinic_id", clinicId)
      .single()
      .returns<DrugIdentityRow>();

    if (fetchError || !current) {
      return { ok: false, error: "Drug not found in this clinic's catalogue." };
    }

    const effectiveName = (name ?? current.name).trim();
    const effectiveForm = form ?? current.form;
    const effectiveStrength = (strength !== undefined ? strength : current.strength)?.trim().toLowerCase() ?? "";

    const { data: candidates, error: checkError } = await supabase
      .from("pharmacy_drugs")
      .select("id, name, strength, form")
      .eq("clinic_id", clinicId)
      .eq("is_active", true)
      .eq("form", effectiveForm)
      .ilike("name", effectiveName)
      .neq("id", drug_id)
      .returns<DrugIdentityRow[]>();

    if (checkError) {
      console.error("[pharmacy.updateDrug] duplicate check failed", checkError);
      return { ok: false, error: "Could not verify the catalogue before saving changes." };
    }

    const duplicate = candidates?.find(
      (row) => (row.strength?.trim().toLowerCase() ?? "") === effectiveStrength
    );

    if (duplicate) {
      return {
        ok: false,
        code: "DUPLICATE_DRUG",
        error: "Another drug with this name, strength, and form already exists.",
      };
    }
  }

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name.trim();
  if (generic_name !== undefined) updates.generic_name = generic_name?.trim() || null;
  if (form !== undefined) updates.form = form;
  if (strength !== undefined) updates.strength = strength?.trim() || null;
  if (unit !== undefined) updates.unit = unit?.trim() || null;

  const { data, error } = await supabase
    .from("pharmacy_drugs")
    .update(updates)
    .eq("id", drug_id)
    .eq("clinic_id", clinicId)
    .select("*")
    .single()
    .returns<PharmacyDrugRow>();

  if (error) {
    console.error("[pharmacy.updateDrug]", error);
    return { ok: false, error: "Could not save changes to this drug." };
  }

  revalidatePath("/dashboard/pharmacy");
  revalidatePath("/dashboard/pharmacy/inventory");
  return { ok: true, data: data as PharmacyDrugRow };
}

export async function setDrugActive(input: SetDrugActiveInput): Promise<ActionResult<PharmacyDrugRow>> {
  const profile = await requireRole("doctor", "staff");

  const gate = assertPharmacyWriter(profile);
  if ("error" in gate) {
    return { ok: false, code: gate.code, error: gate.error };
  }
  const { clinicId } = gate;

  const parsed = setDrugActiveSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  }
  const { drug_id, is_active } = parsed.data;

  const supabase = createServerSupabaseClient();

  if (is_active) {
    const { data: current, error: fetchError } = await supabase
      .from("pharmacy_drugs")
      .select("id, name, strength, form")
      .eq("id", drug_id)
      .eq("clinic_id", clinicId)
      .single()
      .returns<DrugIdentityRow>();

    if (fetchError || !current) {
      return { ok: false, error: "Drug not found in this clinic's catalogue." };
    }

    const normalizedStrength = current.strength?.trim().toLowerCase() ?? "";
    const { data: candidates, error: checkError } = await supabase
      .from("pharmacy_drugs")
      .select("id, name, strength, form")
      .eq("clinic_id", clinicId)
      .eq("is_active", true)
      .eq("form", current.form)
      .ilike("name", current.name)
      .neq("id", drug_id)
      .returns<DrugIdentityRow[]>();

    if (checkError) {
      console.error("[pharmacy.setDrugActive] duplicate check failed", checkError);
      return { ok: false, error: "Could not verify the catalogue before reactivating this drug." };
    }

    const duplicate = candidates?.find(
      (row) => (row.strength?.trim().toLowerCase() ?? "") === normalizedStrength
    );

    if (duplicate) {
      return {
        ok: false,
        code: "DUPLICATE_DRUG",
        error: "Cannot reactivate — an active drug with the same name, strength, and form already exists.",
      };
    }
  }

  const { data, error } = await supabase
    .from("pharmacy_drugs")
    .update({ is_active })
    .eq("id", drug_id)
    .eq("clinic_id", clinicId)
    .select("*")
    .single()
    .returns<PharmacyDrugRow>();

  if (error) {
    console.error("[pharmacy.setDrugActive]", error);
    return { ok: false, error: "Could not update this drug's status." };
  }

  revalidatePath("/dashboard/pharmacy");
  revalidatePath("/dashboard/pharmacy/inventory");
  return { ok: true, data: data as PharmacyDrugRow };
}

// =============================================================================
// INVENTORY — requires pharmacy_access (or admin), checked after the
// clinic-level module flag.
// =============================================================================

export async function listInventory(
  filter: InventoryFilterInput = { include_inactive: false }
): Promise<ActionResult<PharmacyInventoryItem[]>> {
  const profile = await requireRole("doctor", "staff");

  if (!profile.clinic_id) {
    return { ok: false, error: "Your profile is not linked to a clinic." };
  }

  const supabase = createServerSupabaseClient();

  const enabledCheck = await assertPharmacyEnabled(supabase, profile.clinic_id);
  if (!enabledCheck.ok) {
    return { ok: false, code: enabledCheck.code, error: enabledCheck.error };
  }

  const accessGate = assertPharmacyReader(profile);
  if ("error" in accessGate) {
    return { ok: false, code: accessGate.code, error: accessGate.error };
  }

  const parsed = inventoryFilterSchema.safeParse(filter);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid filter." };
  }
  const { search, status, include_inactive } = parsed.data;

  let drugQuery = supabase
    .from("pharmacy_drugs")
    .select("*")
    .eq("clinic_id", profile.clinic_id)
    .order("name", { ascending: true });

  if (!include_inactive) {
    drugQuery = drugQuery.eq("is_active", true);
  }
  if (search) {
    drugQuery = drugQuery.ilike("name", `%${search}%`);
  }

  const { data: drugs, error: drugError } = await drugQuery.returns<PharmacyDrugRow[]>();

  if (drugError) {
    console.error("[pharmacy.listInventory] drug fetch failed", drugError);
    return { ok: false, error: "Could not load the drug catalogue." };
  }
  if (!drugs || drugs.length === 0) {
    return { ok: true, data: [] };
  }

  const { data: inventoryRows, error: invError } = await supabase
    .from("pharmacy_inventory")
    .select("*")
    .eq("clinic_id", profile.clinic_id)
    .in(
      "drug_id",
      drugs.map((d: PharmacyDrugRow) => d.id)
    )
    .returns<PharmacyInventoryRow[]>();

  if (invError) {
    console.error("[pharmacy.listInventory] inventory fetch failed", invError);
    return { ok: false, error: "Could not load stock levels." };
  }

  const inventoryByDrugId = new Map<string, PharmacyInventoryRow>(
    (inventoryRows ?? []).map((row: PharmacyInventoryRow) => [row.drug_id, row])
  );

  let items: PharmacyInventoryItem[] = drugs.map((drug: PharmacyDrugRow) => {
    const inventory: PharmacyInventoryRow | null = inventoryByDrugId.get(drug.id) ?? null;
    return {
      drug,
      inventory,
      computed_status: computeInventoryStatus(inventory),
    };
  });

  if (status) {
    items = items.filter((item) => item.computed_status === status);
  }

  return { ok: true, data: items };
}

export async function initializeInventory(
  input: InitializeInventoryInput
): Promise<ActionResult<PharmacyInventoryRow>> {
  const profile = await requireRole("doctor", "staff");

  const gate = assertPharmacyWriter(profile);
  if ("error" in gate) {
    return { ok: false, code: gate.code, error: gate.error };
  }
  const { clinicId } = gate;

  const parsed = initializeInventorySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid stock details." };
  }
  const { drug_id, quantity_on_hand, reorder_threshold, batch_number, expiry_date, unit_price_paise } =
    parsed.data;

  const supabase = createServerSupabaseClient();

  const { data: drug, error: drugError } = await supabase
    .from("pharmacy_drugs")
    .select("id, is_active")
    .eq("id", drug_id)
    .eq("clinic_id", clinicId)
    .single()
    .returns<{ id: string; is_active: boolean }>();

  if (drugError || !drug) {
    return { ok: false, error: "Drug not found in this clinic's catalogue." };
  }
  if (!drug.is_active) {
    return { ok: false, error: "Cannot stock an inactive drug. Reactivate it first." };
  }

  const { data: existing, error: checkError } = await supabase
    .from("pharmacy_inventory")
    .select("id")
    .eq("clinic_id", clinicId)
    .eq("drug_id", drug_id)
    .maybeSingle();

  if (checkError) {
    console.error("[pharmacy.initializeInventory] duplicate check failed", checkError);
    return { ok: false, error: "Could not check existing stock for this drug." };
  }
  if (existing) {
    return {
      ok: false,
      code: "ALREADY_STOCKED",
      error: "This drug already has a stock record. Use stock adjustment to change the quantity instead.",
    };
  }

  const { data, error } = await supabase
    .from("pharmacy_inventory")
    .insert({
      clinic_id: clinicId,
      drug_id,
      quantity_on_hand,
      reorder_threshold: reorder_threshold ?? null,
      batch_number: batch_number?.trim() || null,
      expiry_date: expiry_date ?? null,
      unit_price_paise: unit_price_paise ?? null,
    })
    .select("*")
    .single()
    .returns<PharmacyInventoryRow>();

  if (error) {
    console.error("[pharmacy.initializeInventory]", error);
    return { ok: false, error: "Could not create the stock record." };
  }

  if (quantity_on_hand > 0) {
    const { error: auditError } = await supabase.from("pharmacy_stock_adjustments").insert({
      clinic_id: clinicId,
      drug_id,
      delta: quantity_on_hand,
      quantity_after: quantity_on_hand,
      reason: "stock_received",
      notes: "Initial stock entry.",
      adjusted_by: profile.id,
    });
    if (auditError) {
      console.error("[pharmacy.initializeInventory] audit log failed", auditError);
    }
  }

  revalidatePath("/dashboard/pharmacy");
  revalidatePath("/dashboard/pharmacy/inventory");
  return { ok: true, data: data as PharmacyInventoryRow };
}

export async function updateInventoryDetails(
  input: UpdateInventoryDetailsInput
): Promise<ActionResult<PharmacyInventoryRow>> {
  const profile = await requireRole("doctor", "staff");

  const gate = assertPharmacyWriter(profile);
  if ("error" in gate) {
    return { ok: false, code: gate.code, error: gate.error };
  }
  const { clinicId } = gate;

  const parsed = updateInventoryDetailsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid stock details." };
  }
  const { drug_id, reorder_threshold, batch_number, expiry_date, unit_price_paise } = parsed.data;

  const supabase = createServerSupabaseClient();

  const updates: Record<string, unknown> = {};
  if (reorder_threshold !== undefined) updates.reorder_threshold = reorder_threshold;
  if (batch_number !== undefined) updates.batch_number = batch_number?.trim() || null;
  if (expiry_date !== undefined) updates.expiry_date = expiry_date;
  if (unit_price_paise !== undefined) updates.unit_price_paise = unit_price_paise;

  if (Object.keys(updates).length === 0) {
    return { ok: false, error: "No changes provided." };
  }

  const { data, error } = await supabase
    .from("pharmacy_inventory")
    .update(updates)
    .eq("clinic_id", clinicId)
    .eq("drug_id", drug_id)
    .select("*")
    .single()
    .returns<PharmacyInventoryRow>();

  if (error) {
    console.error("[pharmacy.updateInventoryDetails]", error);
    return { ok: false, error: "Could not save stock details. Has this drug been stocked yet?" };
  }

  revalidatePath("/dashboard/pharmacy");
  revalidatePath("/dashboard/pharmacy/inventory");
  return { ok: true, data: data as PharmacyInventoryRow };
}

export async function adjustStock(input: AdjustStockInput): Promise<ActionResult<PharmacyInventoryRow>> {
  const profile = await requireRole("doctor", "staff");

  const gate = assertPharmacyWriter(profile);
  if ("error" in gate) {
    return { ok: false, code: gate.code, error: gate.error };
  }
  const { clinicId } = gate;

  const parsed = adjustStockSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid adjustment." };
  }
  const { drug_id, delta, reason, notes } = parsed.data;

  const supabase = createServerSupabaseClient();

  const { data: current, error: fetchError } = await supabase
    .from("pharmacy_inventory")
    .select("quantity_on_hand")
    .eq("clinic_id", clinicId)
    .eq("drug_id", drug_id)
    .single()
    .returns<{ quantity_on_hand: number }>();

  if (fetchError || !current) {
    return { ok: false, error: "No stock record found for this drug. Initialize it first." };
  }

  const newQuantity = current.quantity_on_hand + delta;
  if (newQuantity < 0) {
    return {
      ok: false,
      code: "WOULD_GO_NEGATIVE",
      error: `Cannot remove ${Math.abs(delta)} units — only ${current.quantity_on_hand} on hand.`,
    };
  }

  const { data: updated, error: updateError } = await supabase
    .from("pharmacy_inventory")
    .update({ quantity_on_hand: newQuantity })
    .eq("clinic_id", clinicId)
    .eq("drug_id", drug_id)
    .select("*")
    .single()
    .returns<PharmacyInventoryRow>();

  if (updateError) {
    console.error("[pharmacy.adjustStock] update failed", updateError);
    return { ok: false, error: "Could not update stock. Someone else may have changed it — please retry." };
  }

  const { error: auditError } = await supabase.from("pharmacy_stock_adjustments").insert({
    clinic_id: clinicId,
    drug_id,
    delta,
    quantity_after: newQuantity,
    reason,
    notes: notes?.trim() || null,
    adjusted_by: profile.id,
  });

  if (auditError) {
    console.error("[pharmacy.adjustStock] audit log failed", auditError);
  }

  revalidatePath("/dashboard/pharmacy");
  revalidatePath("/dashboard/pharmacy/inventory");
  return { ok: true, data: updated as PharmacyInventoryRow };
}

// =============================================================================
// PRESCRIPTION QUEUE — requires pharmacy_access (or admin), checked after
// the clinic-level module flag. Excludes both already-dispensed AND
// pharmacy-rejected rows. Patient names resolved via
// pharmacy_lookup_patient_names() — see file header for why.
// =============================================================================

type EncounterDoctorRow = { id: string; doctor_id: string };
type ProfileNameRow = { id: string; full_name: string | null };

export async function getPharmacyQueue(): Promise<ActionResult<PharmacyQueueItem[]>> {
  const profile = await requireRole("doctor", "staff");

  if (!profile.clinic_id) {
    return { ok: false, error: "Your profile is not linked to a clinic." };
  }

  const supabase = createServerSupabaseClient();

  const enabledCheck = await assertPharmacyEnabled(supabase, profile.clinic_id);
  if (!enabledCheck.ok) {
    return { ok: false, code: enabledCheck.code, error: enabledCheck.error };
  }

  const gate = assertPharmacyReader(profile);
  if ("error" in gate) {
    return { ok: false, code: gate.code, error: gate.error };
  }
  const { clinicId } = gate;

  const { data: prescriptions, error: prescError } = await supabase
    .from("prescriptions")
    .select("id, clinic_id, encounter_id, patient_id, medicine_name, dosage, frequency, duration, instructions, status, drug_id, created_at")
    .eq("clinic_id", clinicId)
    .eq("status", "active")
    .is("pharmacy_rejected_at", null)
    .order("created_at", { ascending: true })
    .returns<PrescriptionQueueRow[]>();

  if (prescError) {
    console.error("[pharmacy.getPharmacyQueue] prescriptions fetch failed", prescError);
    return { ok: false, error: "Could not load prescriptions." };
  }
  if (!prescriptions || prescriptions.length === 0) {
    return { ok: true, data: [] };
  }

  const prescriptionIds = prescriptions.map((p) => p.id);
  const { data: liveDispensations, error: dispError } = await supabase
    .from("pharmacy_dispensations")
    .select("prescription_id")
    .eq("clinic_id", clinicId)
    .eq("status", "dispensed")
    .in("prescription_id", prescriptionIds)
    .returns<{ prescription_id: string | null }[]>();

  if (dispError) {
    console.error("[pharmacy.getPharmacyQueue] dispensations fetch failed", dispError);
    return { ok: false, error: "Could not check dispensing status." };
  }

  const dispensedPrescriptionIds = new Set(
    (liveDispensations ?? [])
      .map((d) => d.prescription_id)
      .filter((id): id is string => id !== null)
  );

  const queueLines = prescriptions.filter((p) => !dispensedPrescriptionIds.has(p.id));

  if (queueLines.length === 0) {
    return { ok: true, data: [] };
  }

  const patientIds = Array.from(new Set(queueLines.map((p) => p.patient_id)));
  const patientNamesResult = await lookupPatientNames(supabase, patientIds);
  if (!patientNamesResult.ok) {
    return { ok: false, error: patientNamesResult.error };
  }
  const patientNameById = patientNamesResult.data;

  const encounterIds = Array.from(new Set(queueLines.map((p) => p.encounter_id)));
  const { data: encounters, error: encounterError } = await supabase
    .from("encounters")
    .select("id, doctor_id")
    .eq("clinic_id", clinicId)
    .in("id", encounterIds)
    .returns<EncounterDoctorRow[]>();

  if (encounterError) {
    console.error("[pharmacy.getPharmacyQueue] encounters fetch failed", encounterError);
    return { ok: false, error: "Could not load prescriber details." };
  }

  const doctorIdByEncounterId = new Map<string, string>(
    (encounters ?? []).map((e) => [e.id, e.doctor_id])
  );

  const doctorIds = Array.from(new Set((encounters ?? []).map((e) => e.doctor_id)));
  let doctorNameById = new Map<string, string | null>();
  if (doctorIds.length > 0) {
    const { data: doctors, error: doctorError } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", doctorIds)
      .returns<ProfileNameRow[]>();

    if (doctorError) {
      console.error("[pharmacy.getPharmacyQueue] doctor profiles fetch failed", doctorError);
      return { ok: false, error: "Could not load prescriber details." };
    }
    doctorNameById = new Map((doctors ?? []).map((d) => [d.id, d.full_name]));
  }

  const { data: catalogueDrugs, error: catalogueError } = await supabase
    .from("pharmacy_drugs")
    .select("*")
    .eq("clinic_id", clinicId)
    .eq("is_active", true)
    .returns<PharmacyDrugRow[]>();

  if (catalogueError) {
    console.error("[pharmacy.getPharmacyQueue] catalogue fetch failed", catalogueError);
    return { ok: false, error: "Could not load the drug catalogue." };
  }

  const drugByNormalizedName = new Map<string, PharmacyDrugRow>(
    (catalogueDrugs ?? []).map((d) => [normalizeDrugName(d.name), d])
  );
  const drugById = new Map<string, PharmacyDrugRow>(
    (catalogueDrugs ?? []).map((d) => [d.id, d])
  );

  function resolveMatchedDrug(prescription: PrescriptionQueueRow): PharmacyDrugRow | null {
    if (prescription.drug_id) {
      const byId = drugById.get(prescription.drug_id);
      if (byId) return byId;
    }
    return drugByNormalizedName.get(normalizeDrugName(prescription.medicine_name)) ?? null;
  }

  const matchedDrugIds = Array.from(
    new Set(
      queueLines
        .map((p) => resolveMatchedDrug(p)?.id)
        .filter((id): id is string => id !== undefined)
    )
  );

  let stockByDrugId = new Map<string, { quantity_on_hand: number; reorder_threshold: number | null; expiry_date: string | null; unit_price_paise: number | null }>();
  if (matchedDrugIds.length > 0) {
    const { data: inventoryRows, error: inventoryError } = await supabase
      .from("pharmacy_inventory")
      .select("drug_id, quantity_on_hand, reorder_threshold, expiry_date, unit_price_paise")
      .eq("clinic_id", clinicId)
      .in("drug_id", matchedDrugIds)
      .returns<{ drug_id: string; quantity_on_hand: number; reorder_threshold: number | null; expiry_date: string | null; unit_price_paise: number | null }[]>();

    if (inventoryError) {
      console.error("[pharmacy.getPharmacyQueue] inventory fetch failed", inventoryError);
      return { ok: false, error: "Could not load stock levels." };
    }
    stockByDrugId = new Map(
      (inventoryRows ?? []).map((i) => [
        i.drug_id,
        {
          quantity_on_hand: i.quantity_on_hand,
          reorder_threshold: i.reorder_threshold,
          expiry_date: i.expiry_date,
          unit_price_paise: i.unit_price_paise,
        },
      ])
    );
  }

  const items: PharmacyQueueItem[] = queueLines.map((prescription) => {
    const matchedDrug = resolveMatchedDrug(prescription);
    const doctorId = doctorIdByEncounterId.get(prescription.encounter_id) ?? null;
    const stock = matchedDrug ? stockByDrugId.get(matchedDrug.id) ?? null : null;

    return {
      prescription,
      patient_name: patientNameById.get(prescription.patient_id) ?? "Unknown patient",
      prescriber_name: doctorId ? doctorNameById.get(doctorId) ?? null : null,
      matched_drug: matchedDrug,
      current_stock: stock?.quantity_on_hand ?? null,
      reorder_threshold: stock?.reorder_threshold ?? null,
      expiry_date: stock?.expiry_date ?? null,
      unit_price_paise: stock?.unit_price_paise ?? null,
    };
  });

  return { ok: true, data: items };
}

// =============================================================================
// DISPENSING (single-line — retained for backward compatibility; the queue
// UI now uses dispenseAndBillEncounter for the encounter-grouped flow) —
// requires pharmacy_access (or admin).
// =============================================================================

export async function dispensePrescription(
  input: DispenseInput
): Promise<ActionResult<PharmacyDispensationRow>> {
  const profile = await requireRole("doctor", "staff");

  const gate = assertPharmacyWriter(profile);
  if ("error" in gate) {
    return { ok: false, code: gate.code, error: gate.error };
  }

  const parsed = dispenseSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid dispensing details." };
  }
  const { prescription_id, patient_id, drug_id, quantity, notes, confirm_expired } = parsed.data;

  const supabase = createServerSupabaseClient();

  const { data: dispensationId, error: rpcError } = await supabase.rpc("pharmacy_dispense", {
    p_prescription_id: prescription_id,
    p_patient_id: patient_id,
    p_drug_id: drug_id,
    p_quantity: quantity,
    p_dispensed_by: profile.id,
    p_notes: notes ?? null,
    p_confirm_expired: confirm_expired,
  });

  if (rpcError) {
    const { code, detail } = parsePharmacyRpcError(rpcError.message);
    console.error("[pharmacy.dispensePrescription]", code, detail);
    return {
      ok: false,
      code,
      error: PHARMACY_ERROR_MESSAGES[code] ?? detail,
    };
  }

  const { data: dispensation, error: fetchError } = await supabase
    .from("pharmacy_dispensations")
    .select("*")
    .eq("id", dispensationId as string)
    .single<PharmacyDispensationRow>();

  if (fetchError || !dispensation) {
    console.error("[pharmacy.dispensePrescription] fetch after dispense failed", fetchError);
    return {
      ok: false,
      error: "Dispensed successfully, but could not load the confirmation details. Refresh to see the update.",
    };
  }

  revalidatePath("/dashboard/pharmacy");
  revalidatePath("/dashboard/pharmacy/inventory");
  return { ok: true, data: dispensation };
}

export async function cancelDispensation(
  input: CancelDispensationInput
): Promise<ActionResult<PharmacyDispensationRow>> {
  const profile = await requireRole("doctor", "staff");

  const gate = assertPharmacyWriter(profile); // pharmacist/admin only — matches the RPC's own guard
  if ("error" in gate) {
    return { ok: false, code: gate.code, error: gate.error };
  }

  const parsed = cancelDispensationSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  }
  const { dispensation_id, reason } = parsed.data;

  const supabase = createServerSupabaseClient();

  const { data: resultId, error: rpcError } = await supabase.rpc("pharmacy_cancel_dispensation", {
    p_dispensation_id: dispensation_id,
    p_cancelled_by: profile.id,
    p_reason: reason ?? null,
  });

  if (rpcError) {
    const { code, detail } = parsePharmacyRpcError(rpcError.message);
    console.error("[pharmacy.cancelDispensation]", code, detail);
    return {
      ok: false,
      code,
      error: PHARMACY_ERROR_MESSAGES[code] ?? detail,
    };
  }

  const { data: dispensation, error: fetchError } = await supabase
    .from("pharmacy_dispensations")
    .select("*")
    .eq("id", resultId as string)
    .single<PharmacyDispensationRow>();

  if (fetchError || !dispensation) {
    console.error("[pharmacy.cancelDispensation] fetch after cancel failed", fetchError);
    return {
      ok: false,
      error: "Cancelled successfully, but could not load the confirmation details. Refresh to see the update.",
    };
  }

  revalidatePath("/dashboard/pharmacy");
  revalidatePath("/dashboard/pharmacy/inventory");
  return { ok: true, data: dispensation };
}

// =============================================================================
// REJECT A PRESCRIPTION LINE — pharmacy declines to dispense (e.g.
// insufficient stock, discontinued). Requires pharmacy_access (or admin).
// Goes through pharmacy_reject_prescription() (SECURITY DEFINER RPC), since
// prescriptions_update RLS requires role='doctor' and a staff-role
// pharmacist cannot update that table directly.
// =============================================================================

export async function rejectPrescription(
  input: RejectPrescriptionInput
): Promise<ActionResult<{ prescriptionId: string }>> {
  const profile = await requireRole("doctor", "staff");

  const gate = assertPharmacyWriter(profile);
  if ("error" in gate) {
    return { ok: false, code: gate.code, error: gate.error };
  }

  const parsed = rejectPrescriptionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  }
  const { prescription_id, reason } = parsed.data;

  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase.rpc("pharmacy_reject_prescription", {
    p_prescription_id: prescription_id,
    p_rejected_by: profile.id,
    p_reason: reason,
  });

  if (error || !data) {
    const { code, detail } = parsePharmacyRpcError(error?.message ?? "Unknown error");
    console.error("[pharmacy.rejectPrescription]", code, detail);
    return { ok: false, code, error: PHARMACY_ERROR_MESSAGES[code] ?? detail };
  }

  revalidatePath("/dashboard/pharmacy");

  return { ok: true, data: { prescriptionId: data as string } };
}

// =============================================================================
// DASHBOARD
// =============================================================================

type DispensedTodayJoinRow = {
  id: string;
  patient_id: string;
  drug_id: string;
  quantity_dispensed: number;
  dispensed_at: string;
};

export async function getDispensedToday(): Promise<ActionResult<PharmacyDispensedTodayItem[]>> {
  const profile = await requireRole("doctor", "staff");

  const gate = assertPharmacyReader(profile);
  if ("error" in gate) {
    return { ok: false, code: gate.code, error: gate.error };
  }
  const { clinicId } = gate;

  const supabase = createServerSupabaseClient();

  const today = todayIsoDateIst();
  const startOfDayUtc = new Date(`${today}T00:00:00+05:30`).toISOString();
  const endOfDayUtc = new Date(`${today}T23:59:59.999+05:30`).toISOString();

  const { data: dispensations, error: dispError } = await supabase
    .from("pharmacy_dispensations")
    .select("id, patient_id, drug_id, quantity_dispensed, dispensed_at")
    .eq("clinic_id", clinicId)
    .eq("status", "dispensed")
    .gte("dispensed_at", startOfDayUtc)
    .lte("dispensed_at", endOfDayUtc)
    .order("dispensed_at", { ascending: false })
    .returns<DispensedTodayJoinRow[]>();

  if (dispError) {
    console.error("[pharmacy.getDispensedToday] fetch failed", dispError);
    return { ok: false, error: "Could not load today's dispensing activity." };
  }
  if (!dispensations || dispensations.length === 0) {
    return { ok: true, data: [] };
  }

  const patientIds = Array.from(new Set(dispensations.map((d) => d.patient_id)));
  const patientNamesResult = await lookupPatientNames(supabase, patientIds);
  if (!patientNamesResult.ok) {
    return { ok: false, error: patientNamesResult.error };
  }
  const patientNameById = patientNamesResult.data;

  const drugIds = Array.from(new Set(dispensations.map((d) => d.drug_id)));
  const { data: drugRows, error: drugError } = await supabase
    .from("pharmacy_drugs")
    .select("id, name")
    .in("id", drugIds)
    .returns<{ id: string; name: string }[]>();

  if (drugError) {
    console.error("[pharmacy.getDispensedToday] drugs fetch failed", drugError);
    return { ok: false, error: "Could not load drug details." };
  }
  const drugNameById = new Map<string, string>((drugRows ?? []).map((d) => [d.id, d.name]));

  const items: PharmacyDispensedTodayItem[] = dispensations.map((d) => ({
    id: d.id,
    patient_name: patientNameById.get(d.patient_id) ?? "Unknown patient",
    drug_name: drugNameById.get(d.drug_id) ?? "Unknown drug",
    quantity_dispensed: d.quantity_dispensed,
    dispensed_at: d.dispensed_at,
  }));

  return { ok: true, data: items };
}

export async function getPharmacyDashboardSummary(): Promise<ActionResult<PharmacyDashboardSummary>> {
  const [queueResult, inventoryResult, dispensedResult] = await Promise.all([
    getPharmacyQueue(),
    listInventory({ include_inactive: false }),
    getDispensedToday(),
  ]);

  if (!queueResult.ok) return queueResult;
  if (!inventoryResult.ok) return inventoryResult;
  if (!dispensedResult.ok) return dispensedResult;

  const lowStockCount = inventoryResult.data.filter((item) => item.computed_status === "low_stock").length;
  const expiringSoonCount = inventoryResult.data.filter((item) => item.computed_status === "expiring_soon").length;

  return {
    ok: true,
    data: {
      pending_prescriptions_count: queueResult.data.length,
      dispensed_today_count: dispensedResult.data.length,
      low_stock_count: lowStockCount,
      expiring_soon_count: expiringSoonCount,
    },
  };
}

// =============================================================================
// ADMIN: PHARMACY ACCESS MANAGEMENT
// =============================================================================

const setPharmacyAccessSchema = z.object({
  profile_id: z.string().uuid(),
  pharmacy_access: z.boolean(),
});

export type SetPharmacyAccessInput = z.infer<typeof setPharmacyAccessSchema>;

export async function setPharmacyAccess(
  input: SetPharmacyAccessInput
): Promise<ActionResult<{ id: string; pharmacy_access: boolean }>> {
  const profile = await requireRole("doctor", "staff");

  if (!profile.clinic_id) {
    return { ok: false, error: "Your profile is not linked to a clinic." };
  }
  if (!profile.is_clinic_admin) {
    return { ok: false, error: "Only a clinic admin can grant or revoke pharmacy access." };
  }

  const parsed = setPharmacyAccessSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  }
  const { profile_id, pharmacy_access } = parsed.data;

  const supabase = createServerSupabaseClient();

  const { data: target, error: targetError } = await supabase
    .from("profiles")
    .select("id, role, clinic_id")
    .eq("id", profile_id)
    .single()
    .returns<{ id: string; role: string; clinic_id: string | null }>();

  if (targetError || !target) {
    return { ok: false, error: "Profile not found." };
  }
  if (target.clinic_id !== profile.clinic_id) {
    return { ok: false, error: "This profile does not belong to your clinic." };
  }
  if (target.role === "patient") {
    return { ok: false, error: "Pharmacy access cannot be granted to a patient profile." };
  }

  const { data, error } = await supabase
    .from("profiles")
    .update({ pharmacy_access })
    .eq("id", profile_id)
    .eq("clinic_id", profile.clinic_id)
    .select("id, pharmacy_access")
    .single()
    .returns<{ id: string; pharmacy_access: boolean }>();

  if (error) {
    console.error("[pharmacy.setPharmacyAccess]", error);
    return { ok: false, error: "Could not update pharmacy access." };
  }

  revalidatePath("/dashboard/pharmacy");
  revalidatePath("/dashboard/pharmacy/inventory");
  revalidatePath("/dashboard/admin/users");

  return { ok: true, data: data as { id: string; pharmacy_access: boolean } };
}

// =============================================================================
// ADMIN: AUTO-SEND MEDICINE RECEIPTS SETTING
//
// clinics.auto_send_medicine_receipts, default true. Read by
// dispenseAndBillEncounter below to decide whether to fire the WhatsApp send
// immediately after billing, or leave the message queued for manual send.
// =============================================================================

const setAutoSendMedicineReceiptsSchema = z.object({
  auto_send: z.boolean(),
});

export type SetAutoSendMedicineReceiptsInput = z.infer<typeof setAutoSendMedicineReceiptsSchema>;

export async function setAutoSendMedicineReceipts(
  input: SetAutoSendMedicineReceiptsInput
): Promise<ActionResult<{ auto_send_medicine_receipts: boolean }>> {
  const profile = await requireRole("doctor", "staff");

  if (!profile.clinic_id) {
    return { ok: false, error: "Your profile is not linked to a clinic." };
  }
  if (!profile.is_clinic_admin) {
    return { ok: false, error: "Only a clinic admin can change this setting." };
  }

  const parsed = setAutoSendMedicineReceiptsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  }

  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from("clinics")
    .update({ auto_send_medicine_receipts: parsed.data.auto_send })
    .eq("id", profile.clinic_id)
    .select("auto_send_medicine_receipts")
    .single()
    .returns<{ auto_send_medicine_receipts: boolean }>();

  if (error) {
    console.error("[pharmacy.setAutoSendMedicineReceipts]", error);
    return { ok: false, error: "Could not update this setting." };
  }

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/pharmacy");

  return { ok: true, data: data as { auto_send_medicine_receipts: boolean } };
}

export async function getAutoSendMedicineReceiptsSetting(): Promise<ActionResult<boolean>> {
  const profile = await requireRole("doctor", "staff");

  if (!profile.clinic_id) {
    return { ok: false, error: "Your profile is not linked to a clinic." };
  }

  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from("clinics")
    .select("auto_send_medicine_receipts")
    .eq("id", profile.clinic_id)
    .single()
    .returns<{ auto_send_medicine_receipts: boolean }>();

  if (error || !data) {
    console.error("[pharmacy.getAutoSendMedicineReceiptsSetting]", error);
    return { ok: false, error: "Could not load this setting." };
  }

  return { ok: true, data: data.auto_send_medicine_receipts };
}

// =============================================================================
// DISPENSE + BILL (Chat C, objective 4 + 6) — one payment per encounter,
// covering every selected medicine line, with doctor attribution, discount
// detection, payment collection at dispense, and auto-send of the medicine
// receipt WhatsApp message (clinic-configurable via
// auto_send_medicine_receipts).
// =============================================================================

export interface DispenseAndBillResult {
  paymentId: string;
  receiptNumber: string;
  dispensedCount: number;
  failedLines: { prescriptionId: string; error: string }[];
  discounted: boolean;
  messageAutoSent: boolean;
  collected: boolean;
}

export async function dispenseAndBillEncounter(
  input: DispenseAndBillEncounterInput
): Promise<ActionResult<DispenseAndBillResult>> {
  const profile = await requireRole("doctor", "staff");

  const gate = assertPharmacyWriter(profile);
  if ("error" in gate) {
    return { ok: false, code: gate.code, error: gate.error };
  }
  const { clinicId } = gate;

  const parsed = dispenseAndBillEncounterSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid dispensing details." };
  }
  const { encounter_id, patient_id, lines, final_amount, payment_method, notes } = parsed.data;

  const supabase = createServerSupabaseClient();

  const enabledCheck = await assertPharmacyEnabled(supabase, clinicId);
  if (!enabledCheck.ok) {
    return { ok: false, code: enabledCheck.code, error: enabledCheck.error };
  }

  const { data: encounter, error: encounterError } = await supabase
    .from("encounters")
    .select("id, doctor_id, patient_id")
    .eq("id", encounter_id)
    .eq("clinic_id", clinicId)
    .single()
    .returns<{ id: string; doctor_id: string; patient_id: string }>();

  if (encounterError || !encounter) {
    return { ok: false, error: "Encounter not found." };
  }
  if (encounter.patient_id !== patient_id) {
    return { ok: false, error: "Patient does not match this encounter." };
  }

  const drugIds = Array.from(new Set(lines.map((l) => l.drug_id)));
  const { data: drugRows, error: drugsError } = await supabase
    .from("pharmacy_drugs")
    .select("id, name, strength")
    .eq("clinic_id", clinicId)
    .in("id", drugIds)
    .returns<{ id: string; name: string; strength: string | null }[]>();

  if (drugsError || !drugRows) {
    return { ok: false, error: "Could not load drug details." };
  }
  const drugById = new Map(drugRows.map((d) => [d.id, d]));

  const { data: inventoryRows, error: inventoryError } = await supabase
    .from("pharmacy_inventory")
    .select("drug_id, unit_price_paise")
    .eq("clinic_id", clinicId)
    .in("drug_id", drugIds)
    .returns<{ drug_id: string; unit_price_paise: number | null }[]>();

  if (inventoryError) {
    return { ok: false, error: "Could not load pricing details." };
  }
  const priceByDrugId = new Map(
    (inventoryRows ?? []).map((i) => [i.drug_id, i.unit_price_paise])
  );

  const dispensedLines: {
    prescriptionId: string;
    drugId: string;
    quantity: number;
    dispensationId: string;
  }[] = [];
  const failedLines: { prescriptionId: string; error: string }[] = [];

  for (const line of lines) {
    const { data: dispensationId, error: rpcError } = await supabase.rpc("pharmacy_dispense", {
      p_prescription_id: line.prescription_id,
      p_patient_id: patient_id,
      p_drug_id: line.drug_id,
      p_quantity: line.quantity,
      p_dispensed_by: profile.id,
      p_notes: notes ?? null,
      p_confirm_expired: line.confirm_expired,
    });

    if (rpcError || !dispensationId) {
      const { code, detail } = parsePharmacyRpcError(rpcError?.message ?? "Unknown error");
      failedLines.push({
        prescriptionId: line.prescription_id,
        error: PHARMACY_ERROR_MESSAGES[code] ?? detail,
      });
      continue;
    }

    dispensedLines.push({
      prescriptionId: line.prescription_id,
      drugId: line.drug_id,
      quantity: line.quantity,
      dispensationId: dispensationId as string,
    });
  }

  if (dispensedLines.length === 0) {
    return {
      ok: false,
      error: "None of the selected medicines could be dispensed. " + (failedLines[0]?.error ?? ""),
    };
  }

  const computedSubtotalRupees = dispensedLines.reduce((sum, line) => {
    const priceRupees = (priceByDrugId.get(line.drugId) ?? 0) / 100;
    return sum + priceRupees * line.quantity;
  }, 0);

  const { data: receiptNumber, error: receiptError } = await supabase.rpc("next_receipt_number", {
    p_clinic_id: clinicId,
  });

  if (receiptError || !receiptNumber) {
    console.error("[pharmacy.dispenseAndBillEncounter] receipt number failed", receiptError);
    return {
      ok: false,
      error:
        "Medicines were dispensed, but a receipt number could not be generated. " +
        "Contact support — stock has already been decremented.",
    };
  }

  const { data: payment, error: paymentError } = await supabase
    .from("payments")
    .insert({
      clinic_id: clinicId,
      patient_id,
      appointment_id: null,
      doctor_id: encounter.doctor_id,
      payment_source: "medicine",
      description: "Medicines dispensed",
      amount_charged: 0,
      amount_paid: 0,
      approval_status: "approved",
      approved_by: profile.id,
      approved_at: new Date().toISOString(),
      created_by: profile.id,
      receipt_number: receiptNumber,
    })
    .select("id")
    .single()
    .returns<{ id: string }>();

  if (paymentError || !payment) {
    console.error("[pharmacy.dispenseAndBillEncounter] payment insert failed", paymentError);
    return {
      ok: false,
      error:
        "Medicines were dispensed, but the bill could not be created. " +
        "Contact support — stock has already been decremented.",
    };
  }

  const lineItemRows = dispensedLines.map((line, idx) => {
    const drug = drugById.get(line.drugId);
    const priceRupees = (priceByDrugId.get(line.drugId) ?? 0) / 100;
    const label = drug ? `${drug.name}${drug.strength ? ` ${drug.strength}` : ""}` : "Medicine";
    return {
      clinic_id: clinicId,
      payment_id: payment.id,
      description: label,
      quantity: line.quantity,
      unit_price: priceRupees,
      sort_order: idx,
      dispensation_id: line.dispensationId,
    };
  });

  const { error: lineItemsError } = await supabase.from("payment_line_items").insert(lineItemRows);

  if (lineItemsError) {
    console.error("[pharmacy.dispenseAndBillEncounter] line items failed", lineItemsError);
    return {
      ok: false,
      error:
        "Medicines were dispensed, but line items could not be saved. " +
        "Contact support — stock has already been decremented and a payment record exists.",
    };
  }

  // At this point trg_sync_charged_from_items has already fired and set
  // payments.amount_charged = SUM(line items) = computedSubtotalRupees.

  let discounted = false;
  const roundedSubtotal = Math.round(computedSubtotalRupees * 100) / 100;
  const finalAmount = final_amount ?? roundedSubtotal;

  if (Math.abs(finalAmount - roundedSubtotal) > 0.005) {
    discounted = true;
    const { error: discountError } = await supabase
      .from("payments")
      .update({
        amount_charged: finalAmount,
        discounted_from_amount: roundedSubtotal,
        updated_at: new Date().toISOString(),
      })
      .eq("id", payment.id)
      .eq("clinic_id", clinicId);

    if (discountError) {
      console.error("[pharmacy.dispenseAndBillEncounter] discount update failed", discountError);
    }
  }

  // Record the actual payment collection — medicine is paid at dispense,
  // per the original product decision. Inserting here fires
  // trg_update_payment_amount_paid, which sets payments.amount_paid =
  // finalAmount, making the generated payment_status column resolve to
  // 'paid'. amount_collected has a CHECK > 0 constraint — a
  // fully-discounted-to-zero bill correctly skips this insert, since
  // payment_status already resolves to 'paid' on its own when
  // amount_paid (0) >= amount_charged (0).
  let collected = false;
  if (finalAmount > 0) {
    const { error: collectionError } = await supabase.from("payment_collections").insert({
      clinic_id: clinicId,
      payment_id: payment.id,
      amount_collected: finalAmount,
      collection_date: new Date().toISOString(),
      payment_method,
      collected_by: profile.id,
    });

    if (collectionError) {
      console.error("[pharmacy.dispenseAndBillEncounter] payment collection failed", collectionError);
      // Non-fatal to the overall result, but genuinely important: the bill
      // exists and stock is decremented, yet it will show as unpaid until
      // someone manually records a collection from the Payments page.
    } else {
      collected = true;
    }
  } else {
    collected = true; // nothing to collect on a fully-discounted bill
  }

  // Receipt document + message queue + auto-send — all best-effort,
  // non-blocking. The bill, dispensing, and collection are already
  // committed by this point; nothing here should be reported as if the
  // dispense itself failed. If auto-send fails or is disabled, the
  // message simply sits pending in Messages as the manual fallback.
  let messageAutoSent = false;
  try {
    await generateAndStoreMedicineReceipt(payment.id);
  } catch (docErr) {
    console.error("[pharmacy.dispenseAndBillEncounter] receipt generation failed", docErr);
  }
  try {
    const { createMedicineReceiptMessage, sendMessage } = await import("@/features/messaging/actions");
    const messageResult = await createMedicineReceiptMessage({ paymentId: payment.id });

    if (messageResult.success && messageResult.messageId) {
      const { data: clinicSettings } = await supabase
        .from("clinics")
        .select("auto_send_medicine_receipts")
        .eq("id", clinicId)
        .single()
        .returns<{ auto_send_medicine_receipts: boolean }>();

      // Fail toward "send automatically" if the setting can't be read for
      // any reason — matches the default=true product decision rather than
      // silently reverting to manual-only on an unrelated read error.
      const autoSend = clinicSettings ? clinicSettings.auto_send_medicine_receipts : true;

      if (autoSend) {
        const sendResult = await sendMessage({ messageId: messageResult.messageId });
        if (sendResult.success) {
          messageAutoSent = true;
        } else {
          console.error("[pharmacy.dispenseAndBillEncounter] auto-send failed", sendResult.error);
        }
      }
    }
  } catch (msgErr) {
    console.error("[pharmacy.dispenseAndBillEncounter] message queue/send failed", msgErr);
  }

  revalidatePath("/dashboard/pharmacy");
  revalidatePath("/dashboard/pharmacy/inventory");
  revalidatePath("/dashboard/payments");
  revalidatePath("/dashboard/messages");
  revalidatePath("/dashboard/overview");
  revalidatePath(`/dashboard/patients/${patient_id}`);

  return {
    ok: true,
    data: {
      paymentId: payment.id,
      receiptNumber,
      dispensedCount: dispensedLines.length,
      failedLines,
      discounted,
      messageAutoSent,
      collected,
    },
  };
}

// =============================================================================
// RECENT MEDICINE SALES (Chat C, objective 6) — feeds the "Recent medicine
// sales" panel on the shared staff/doctor dashboard (/dashboard/overview).
// Doctor attribution comes straight from payments.doctor_id, already set to
// the PRESCRIBING doctor by dispenseAndBillEncounter above. Patient names
// resolved via pharmacy_lookup_patient_names() — see file header for why.
// =============================================================================

export interface RecentMedicineSaleItem {
  id: string;
  patient_name: string;
  doctor_name: string;
  drug_summary: string;
  amount_charged_paise: number;
  discounted: boolean;
  created_at: string;
}

export async function getRecentMedicineSales(limit = 10): Promise<ActionResult<RecentMedicineSaleItem[]>> {
  const profile = await requireRole("doctor", "staff");

  if (!profile.clinic_id) {
    return { ok: false, error: "Your profile is not linked to a clinic." };
  }

  const supabase = createServerSupabaseClient();

  const { data: payments, error: paymentsError } = await supabase
    .from("payments")
    .select(
      `
      id,
      patient_id,
      amount_charged,
      discounted_from_amount,
      created_at,
      description,
      profiles!doctor_id (full_name),
      payment_line_items (description, sort_order)
    `
    )
    .eq("clinic_id", profile.clinic_id)
    .eq("payment_source", "medicine")
    .order("created_at", { ascending: false })
    .limit(limit)
    .returns<{ id: string; patient_id: string; amount_charged: number; discounted_from_amount: number | null; created_at: string; description: string | null; profiles: { full_name: string | null } | null; payment_line_items: { description: string; sort_order: number }[] | null }[]>();

  if (paymentsError) {
    console.error("[pharmacy.getRecentMedicineSales] payments fetch failed", paymentsError);
    return { ok: false, error: "Could not load recent medicine sales." };
  }
  if (!payments || payments.length === 0) {
    return { ok: true, data: [] };
  }

  const patientIds = Array.from(new Set(payments.map((p) => p.patient_id)));
  const patientNamesResult = await lookupPatientNames(supabase, patientIds);
  if (!patientNamesResult.ok) {
    return { ok: false, error: patientNamesResult.error };
  }
  const patientNameById = patientNamesResult.data;

  const items: RecentMedicineSaleItem[] = payments.map((row) => {
    const lineItems = (row.payment_line_items ?? []).sort((a, b) => a.sort_order - b.sort_order);
    const drugSummary =
      lineItems.length === 0
        ? row.description ?? "Medicines"
        : lineItems.length === 1
          ? lineItems[0].description
          : `${lineItems[0].description} (+${lineItems.length - 1} more)`;

    return {
      id: row.id,
      patient_name: patientNameById.get(row.patient_id) ?? "Unknown patient",
      doctor_name: row.profiles?.full_name ?? "Unassigned",
      drug_summary: drugSummary,
      amount_charged_paise: Math.round(row.amount_charged * 100),
      discounted: row.discounted_from_amount != null,
      created_at: row.created_at,
    };
  });

  return { ok: true, data: items };
}

// =============================================================================
// ADMIN: DISCOUNTED MEDICINE BILLS (objective 9) — recent medicine payments
// where the final charged amount was edited down from the computed
// subtotal. Admin-only, distinct from getRecentMedicineSales (which any
// doctor/staff sees on the shared dashboard and already badges discounted
// rows) — this is the dedicated admin-facing surface for the same signal.
// Patient names resolved via pharmacy_lookup_patient_names() — see file
// header for why. Doctor/approver names fetched separately to avoid a
// double self-join on profiles in one nested select, which was previously
// causing PostgREST to silently resolve the joined object as null.
// =============================================================================

export interface DiscountedMedicineBillItem {
  id: string;
  patient_name: string;
  doctor_name: string;
  dispensed_by_name: string;
  original_amount_paise: number;
  final_amount_paise: number;
  discount_amount_paise: number;
  created_at: string;
}

export async function getDiscountedMedicineBills(
  limit = 10
): Promise<ActionResult<DiscountedMedicineBillItem[]>> {
  const profile = await requireRole("doctor", "staff");

  if (!profile.clinic_id) {
    return { ok: false, error: "Your profile is not linked to a clinic." };
  }
  if (!profile.is_clinic_admin) {
    return { ok: false, error: "Only a clinic admin can view discounted bills." };
  }

  const supabase = createServerSupabaseClient();

  const { data: payments, error: paymentsError } = await supabase
    .from("payments")
    .select("id, patient_id, doctor_id, approved_by, amount_charged, discounted_from_amount, created_at")
    .eq("clinic_id", profile.clinic_id)
    .eq("payment_source", "medicine")
    .not("discounted_from_amount", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit)
    .returns<{ id: string; patient_id: string; doctor_id: string | null; approved_by: string | null; amount_charged: number; discounted_from_amount: number; created_at: string }[]>();

  if (paymentsError) {
    console.error("[pharmacy.getDiscountedMedicineBills] payments fetch failed", paymentsError);
    return { ok: false, error: "Could not load discounted medicine bills." };
  }
  if (!payments || payments.length === 0) {
    return { ok: true, data: [] };
  }

  const patientIds = Array.from(new Set(payments.map((p) => p.patient_id)));
  const patientNamesResult = await lookupPatientNames(supabase, patientIds);
  if (!patientNamesResult.ok) {
    return { ok: false, error: patientNamesResult.error };
  }
  const patientNameById = patientNamesResult.data;

  const profileIds = Array.from(
    new Set(
      payments
        .flatMap((p) => [p.doctor_id, p.approved_by])
        .filter((id): id is string => id !== null)
    )
  );
  let profileNameById = new Map<string, string | null>();
  if (profileIds.length > 0) {
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", profileIds)
      .returns<{ id: string; full_name: string | null }[]>();

    if (profilesError) {
      console.error("[pharmacy.getDiscountedMedicineBills] profiles fetch failed", profilesError);
      return { ok: false, error: "Could not load staff details." };
    }
    profileNameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));
  }

  const items: DiscountedMedicineBillItem[] = payments.map((row) => {
    const originalPaise = Math.round(row.discounted_from_amount * 100);
    const finalPaise = Math.round(row.amount_charged * 100);
    return {
      id: row.id,
      patient_name: patientNameById.get(row.patient_id) ?? "Unknown patient",
      doctor_name: (row.doctor_id ? profileNameById.get(row.doctor_id) : null) ?? "Unassigned",
      dispensed_by_name: (row.approved_by ? profileNameById.get(row.approved_by) : null) ?? "Unknown",
      original_amount_paise: originalPaise,
      final_amount_paise: finalPaise,
      discount_amount_paise: originalPaise - finalPaise,
      created_at: row.created_at,
    };
  });

  return { ok: true, data: items };
}