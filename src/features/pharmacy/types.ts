// CURAKIN Pharmacy Tier-1 — shared types.
//
// The *_VALUES arrays below are the single source of truth for every
// constrained string column in the pharmacy tables. schema.ts derives its
// Zod enums from these same arrays — never redeclare the value lists there.
// If a DB CHECK constraint ever changes, update it here first.

// ---------------------------------------------------------------------------
// pharmacy_drugs.form
// Mirrors: pharmacy_drugs_form_allowed CHECK constraint
// ---------------------------------------------------------------------------

export const PHARMACY_DRUG_FORM_VALUES = [
  "tablet",
  "capsule",
  "syrup",
  "suspension",
  "injection",
  "ointment",
  "cream",
  "drops",
  "inhaler",
  "sachet",
  "other",
] as const;

export type PharmacyDrugForm = (typeof PHARMACY_DRUG_FORM_VALUES)[number];

export const PHARMACY_DRUG_FORM_LABELS: Record<PharmacyDrugForm, string> = {
  tablet: "Tablet",
  capsule: "Capsule",
  syrup: "Syrup",
  suspension: "Suspension",
  injection: "Injection",
  ointment: "Ointment",
  cream: "Cream",
  drops: "Drops",
  inhaler: "Inhaler",
  sachet: "Sachet",
  other: "Other",
};

// ---------------------------------------------------------------------------
// pharmacy_stock_adjustments.reason
// Mirrors: pharmacy_stock_adjustments_reason_allowed CHECK constraint
// ---------------------------------------------------------------------------

export const PHARMACY_STOCK_ADJUSTMENT_REASON_VALUES = [
  "manual_correction",
  "stock_received",
  "damaged",
  "expired_removed",
  "dispensed",
  "other",
] as const;

export type PharmacyStockAdjustmentReason = (typeof PHARMACY_STOCK_ADJUSTMENT_REASON_VALUES)[number];

export const PHARMACY_STOCK_ADJUSTMENT_REASON_LABELS: Record<PharmacyStockAdjustmentReason, string> = {
  manual_correction: "Manual correction",
  stock_received: "Stock received",
  damaged: "Damaged / discarded",
  expired_removed: "Expired stock removed",
  dispensed: "Dispensed",
  other: "Other",
};

// Reasons a human can pick when correcting stock by hand. "dispensed" is
// written only by pharmacy_dispense() itself — never offer it in a form.
export const PHARMACY_MANUAL_ADJUSTMENT_REASON_VALUES = PHARMACY_STOCK_ADJUSTMENT_REASON_VALUES.filter(
  (reason) => reason !== "dispensed"
) as Exclude<PharmacyStockAdjustmentReason, "dispensed">[];

// ---------------------------------------------------------------------------
// pharmacy_dispensations.status
// Mirrors: pharmacy_dispensations_status_allowed CHECK constraint
// "pending" is reserved in the DB but unused in v1 — the queue is derived
// from prescriptions with no live dispensation, not from pending rows.
// ---------------------------------------------------------------------------

export const PHARMACY_DISPENSATION_STATUS_VALUES = ["pending", "dispensed", "cancelled"] as const;

export type PharmacyDispensationStatus = (typeof PHARMACY_DISPENSATION_STATUS_VALUES)[number];

// ---------------------------------------------------------------------------
// prescriptions.status
// Mirrors: prescriptions_status_check CHECK constraint (pre-existing table,
// Chat 14). Reproduced here read-only — this feature never writes it.
// ---------------------------------------------------------------------------

export const PRESCRIPTION_STATUS_VALUES = ["active", "stopped", "completed"] as const;

export type PrescriptionStatus = (typeof PRESCRIPTION_STATUS_VALUES)[number];

// ---------------------------------------------------------------------------
// Derived, client-side-only status for an inventory row. Never stored —
// computed at query/render time from quantity_on_hand, reorder_threshold,
// and expiry_date. Deterministic arithmetic, not a clinical judgement.
// ---------------------------------------------------------------------------

export const PHARMACY_INVENTORY_STATUS_VALUES = ["ok", "low_stock", "expiring_soon", "expired"] as const;

export type PharmacyInventoryStatus = (typeof PHARMACY_INVENTORY_STATUS_VALUES)[number];

export const PHARMACY_INVENTORY_STATUS_LABELS: Record<PharmacyInventoryStatus, string> = {
  ok: "OK",
  low_stock: "Low stock",
  expiring_soon: "Expiring soon",
  expired: "Expired",
};

// Window used to flag "expiring soon" on the dashboard summary card and the
// inventory table. Kept as a named constant so the UI and any future
// server-side query use the same number.
export const PHARMACY_EXPIRING_SOON_WINDOW_DAYS = 30;

// ---------------------------------------------------------------------------
// Row types — mirror the live schema column-for-column.
// Nullable DB columns are `| null`, matching what Supabase returns (never
// `undefined`).
// ---------------------------------------------------------------------------

export interface PharmacyDrugRow {
  id: string;
  clinic_id: string;
  name: string;
  generic_name: string | null;
  form: PharmacyDrugForm;
  strength: string | null;
  unit: string | null;
  code: string | null;
  code_system: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PharmacyInventoryRow {
  id: string;
  clinic_id: string;
  drug_id: string;
  quantity_on_hand: number;
  reorder_threshold: number | null;
  batch_number: string | null;
  expiry_date: string | null; // ISO date (YYYY-MM-DD), IST — see IST_OFFSET_MS usage in actions.ts
  unit_price_paise: number | null;
  created_at: string;
  updated_at: string;
}

export interface PharmacyStockAdjustmentRow {
  id: string;
  clinic_id: string;
  drug_id: string;
  delta: number;
  quantity_after: number;
  reason: PharmacyStockAdjustmentReason;
  notes: string | null;
  adjusted_by: string | null;
  adjusted_at: string;
}

export interface PharmacyDispensationRow {
  id: string;
  clinic_id: string;
  prescription_id: string | null;
  patient_id: string;
  drug_id: string;
  quantity_dispensed: number;
  status: PharmacyDispensationStatus;
  dispensed_by: string | null;
  dispensed_at: string;
  cancelled_by: string | null;
  cancelled_at: string | null;
  notes: string | null;
  created_at: string;
}

// Minimal read-only shape of the pre-existing prescriptions table (Chat 14),
// reproduced here only for the fields the pharmacy queue needs to display.
export interface PrescriptionQueueRow {
  id: string;
  clinic_id: string;
  encounter_id: string;
  patient_id: string;
  medicine_name: string;
  dosage: string | null;
  frequency: string | null;
  duration: string | null;
  instructions: string | null;
  status: PrescriptionStatus;
  drug_id: string | null; // catalogue reference, set when the doctor prescribed from the catalogue (Chat B)
  created_at: string;
}

// ---------------------------------------------------------------------------
// Composed / joined view types — what actions.ts returns to components,
// not raw table rows.
// ---------------------------------------------------------------------------

// One line in the pharmacist's queue: a prescription with no live
// dispensation yet, joined with patient name and prescriber for display.
//
// reorder_threshold / expiry_date describe MATCHED_DRUG's inventory row (if
// any) — added so the dashboard and dispense drawer can compute low-stock /
// expired state without a second round trip. Both null if matched_drug is
// null or has no inventory row yet.
export interface PharmacyQueueItem {
  prescription: PrescriptionQueueRow;
  patient_name: string;
  prescriber_name: string | null;
  matched_drug: PharmacyDrugRow | null;
  current_stock: number | null;
  reorder_threshold: number | null;
  expiry_date: string | null;
  unit_price_paise: number | null; // Chat C — needed for live bill subtotal in the encounter drawer
}

// One row in the inventory table: drug + its stock row + computed status.
export interface PharmacyInventoryItem {
  drug: PharmacyDrugRow;
  inventory: PharmacyInventoryRow | null; // null if the drug exists in the catalogue but has never been stocked
  computed_status: PharmacyInventoryStatus | "not_stocked";
}

// One line in the "dispensed today" list.
export interface PharmacyDispensedTodayItem {
  id: string;
  patient_name: string;
  drug_name: string;
  quantity_dispensed: number;
  dispensed_at: string;
}

// Dashboard summary card counts.
export interface PharmacyDashboardSummary {
  pending_prescriptions_count: number;
  dispensed_today_count: number;
  low_stock_count: number;
  expiring_soon_count: number;
}