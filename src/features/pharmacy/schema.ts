// CURAKIN Pharmacy Tier-1 — Zod validation schemas.
//
// Enums here are derived from the *_VALUES arrays in types.ts, never
// redeclared. That keeps the DB CHECK constraint, the TypeScript type, and
// this runtime validator as one source of truth instead of three.

import { z } from "zod";
import { PHARMACY_DRUG_FORM_VALUES, PHARMACY_MANUAL_ADJUSTMENT_REASON_VALUES } from "./types";

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

const uuidField = z.string().uuid();

// ISO date string, YYYY-MM-DD. Distinct from a full timestamp — expiry_date
// is a `date` column, not `timestamptz`.
const isoDateField = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected an ISO date (YYYY-MM-DD)");

// Trims and rejects blank strings, matching the pharmacy_drugs_name_not_blank
// CHECK constraint (which checks btrim(name), not raw length).
const nonBlankString = (maxLength: number) => z.string().trim().min(1, "This field cannot be blank").max(maxLength);

// Mirrors payment_collections.payment_method's CHECK constraint exactly
// (20260620073833_create_payment_collections_table.sql) — used when
// recording payment collection at dispense time.
const PAYMENT_METHOD_VALUES = ["cash", "card", "upi", "bank_transfer", "check", "other"] as const;

// ---------------------------------------------------------------------------
// Drug catalogue
// ---------------------------------------------------------------------------

export const createDrugSchema = z.object({
  name: nonBlankString(200),
  generic_name: nonBlankString(200).nullable().optional(),
  form: z.enum(PHARMACY_DRUG_FORM_VALUES),
  strength: nonBlankString(50).nullable().optional(),
  unit: nonBlankString(30).nullable().optional(),
});

export type CreateDrugInput = z.infer<typeof createDrugSchema>;

export const updateDrugSchema = createDrugSchema.partial().extend({
  drug_id: uuidField,
});

export type UpdateDrugInput = z.infer<typeof updateDrugSchema>;

export const setDrugActiveSchema = z.object({
  drug_id: uuidField,
  is_active: z.boolean(),
});

export type SetDrugActiveInput = z.infer<typeof setDrugActiveSchema>;

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------

// Used when a drug is stocked for the first time — creates the
// pharmacy_inventory row. quantity_on_hand starts here; further changes go
// through adjustStockSchema so every change after the first is audited.
export const initializeInventorySchema = z.object({
  drug_id: uuidField,
  quantity_on_hand: z.number().int().min(0),
  reorder_threshold: z.number().int().min(0).nullable().optional(),
  batch_number: nonBlankString(100).nullable().optional(),
  expiry_date: isoDateField.nullable().optional(),
  unit_price_paise: z.number().int().min(0).nullable().optional(),
});

export type InitializeInventoryInput = z.infer<typeof initializeInventorySchema>;

// Updates the non-quantity fields of an existing inventory row (threshold,
// batch, expiry, price). Quantity changes always go through adjustStock so
// they are audited — this schema deliberately excludes quantity_on_hand.
export const updateInventoryDetailsSchema = z.object({
  drug_id: uuidField,
  reorder_threshold: z.number().int().min(0).nullable().optional(),
  batch_number: nonBlankString(100).nullable().optional(),
  expiry_date: isoDateField.nullable().optional(),
  unit_price_paise: z.number().int().min(0).nullable().optional(),
});

export type UpdateInventoryDetailsInput = z.infer<typeof updateInventoryDetailsSchema>;

// A manual stock correction (add/remove units by hand). `delta` can be
// negative (e.g. damaged stock removed) or positive (e.g. new stock
// received). "dispensed" is excluded from the reason enum here — only
// pharmacy_dispense() may write that reason.
export const adjustStockSchema = z.object({
  drug_id: uuidField,
  delta: z.number().int().refine((val) => val !== 0, "Adjustment must be non-zero"),
  reason: z.enum(PHARMACY_MANUAL_ADJUSTMENT_REASON_VALUES as [string, ...string[]]),
  notes: nonBlankString(500).nullable().optional(),
});

export type AdjustStockInput = z.infer<typeof adjustStockSchema>;

// ---------------------------------------------------------------------------
// Dispensing
// ---------------------------------------------------------------------------

export const dispenseSchema = z.object({
  prescription_id: uuidField.nullable(), // null = walk-in dispensation with no linked prescription
  patient_id: uuidField,
  drug_id: uuidField,
  quantity: z.number().int().positive(),
  notes: nonBlankString(500).nullable().optional(),
  confirm_expired: z.boolean().default(false),
});

export type DispenseInput = z.infer<typeof dispenseSchema>;

export const cancelDispensationSchema = z.object({
  dispensation_id: uuidField,
  reason: nonBlankString(500).nullable().optional(),
});

export type CancelDispensationInput = z.infer<typeof cancelDispensationSchema>;

// Rejecting a prescription line at the pharmacy step (e.g. insufficient
// stock, discontinued drug). Goes through pharmacy_reject_prescription()
// (SECURITY DEFINER RPC) rather than a direct prescriptions table update —
// prescriptions_update RLS requires role='doctor', which a staff-role
// pharmacist with pharmacy_access does not have.
export const rejectPrescriptionSchema = z.object({
  prescription_id: uuidField,
  reason: nonBlankString(500),
});

export type RejectPrescriptionInput = z.infer<typeof rejectPrescriptionSchema>;

// ---------------------------------------------------------------------------
// Queries / filters (for inventory search, dashboard filters, etc.)
// ---------------------------------------------------------------------------

export const inventoryFilterSchema = z.object({
  search: z.string().trim().max(200).optional(),
  status: z.enum(["ok", "low_stock", "expiring_soon", "expired", "not_stocked"]).optional(),
  include_inactive: z.boolean().default(false),
});

export type InventoryFilterInput = z.infer<typeof inventoryFilterSchema>;

// ---------------------------------------------------------------------------
// Dispense + bill (Chat C, objective 4 + 6) — one payment per encounter,
// covering every selected medicine line dispensed in that visit.
//
// payment_method is required: medicine is paid at the point of dispensing
// (per the original product decision), not a separate manual step. This
// drives an actual payment_collections insert in the action, so the bill is
// marked paid the moment it's created — not left permanently unpaid the way
// it silently was before this field existed.
// ---------------------------------------------------------------------------

export const dispenseAndBillEncounterSchema = z.object({
  encounter_id: uuidField,
  patient_id: uuidField,
  lines: z
    .array(
      z.object({
        // Always a real prescription from the queue in this flow — unlike
        // dispenseSchema.prescription_id above, this is never a walk-in, so
        // it's non-nullable here.
        prescription_id: uuidField,
        drug_id: uuidField,
        quantity: z.number().int().positive(),
        confirm_expired: z.boolean().default(false),
      })
    )
    .min(1, "Select at least one medicine to dispense."),
  // Final total the pharmacist confirmed, possibly discounted below the
  // computed subtotal. If omitted or equal to the computed total, no
  // discount is recorded.
  final_amount: z.number().nonnegative().optional(),
  payment_method: z.enum(PAYMENT_METHOD_VALUES),
  notes: nonBlankString(500).nullable().optional(),
});

export type DispenseAndBillEncounterInput = z.infer<typeof dispenseAndBillEncounterSchema>;