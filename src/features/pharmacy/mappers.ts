// src/features/pharmacy/mappers.ts
//
// Pure, framework-agnostic mapping between the DB-shaped types in types.ts
// and the UI-shaped props the v0.dev components expect. Kept separate from
// actions.ts because "use server" files may only export async server
// actions — these are plain sync functions used by client components.

import type { PharmacyQueueItem, PharmacyInventoryItem, PharmacyDrugForm } from "./types";
import { PHARMACY_DRUG_FORM_LABELS } from "./types";
import type { PendingPrescription } from "./components/pharmacy-dashboard";
import type { DispensePrescription } from "./components/dispense-drawer";
import type { DrugRow, DrugStatus } from "./components/pharmacy-inventory";


function isExpired(expiryDate: string | null, todayIso: string): boolean {
  return expiryDate !== null && expiryDate < todayIso;
}

function computeQueueStockStatus(
  item: PharmacyQueueItem,
  todayIso: string
): PendingPrescription["stockStatus"] {
  if (!item.matched_drug) return "not_in_catalogue";
  if (isExpired(item.expiry_date, todayIso)) return "expired";
  if (
    item.reorder_threshold !== null &&
    item.current_stock !== null &&
    item.current_stock <= item.reorder_threshold
  ) {
    return "low";
  }
  return "healthy";
}

export function mapQueueItemToPendingPrescription(
  item: PharmacyQueueItem,
  todayIso: string
): PendingPrescription {
  return {
    id: item.prescription.id,
    patientName: item.patient_name,
    doctorName: item.prescriber_name,
    drugName: item.prescription.medicine_name,
    dosage: item.prescription.dosage,
    frequency: item.prescription.frequency,
    duration: item.prescription.duration,
    prescribedDate: item.prescription.created_at,
    stockStatus: computeQueueStockStatus(item, todayIso),
    stockOnHand: item.current_stock,
  };
}

export function mapQueueItemToDispensePrescription(
  item: PharmacyQueueItem,
  todayIso: string
): DispensePrescription {
  return {
    id: item.prescription.id,
    patientName: item.patient_name,
    doctorName: item.prescriber_name ?? "Unknown",
    drugName: item.matched_drug?.name ?? item.prescription.medicine_name,
    strength: item.matched_drug?.strength ?? undefined,
    form: item.matched_drug ? PHARMACY_DRUG_FORM_LABELS[item.matched_drug.form] : undefined,
    unit: item.matched_drug?.unit ?? undefined,
    dosage: item.prescription.dosage ?? undefined,
    frequency: item.prescription.frequency ?? undefined,
    duration: item.prescription.duration ?? undefined,
    instructions: item.prescription.instructions ?? undefined,
    stockOnHand: item.current_stock,
    reorderThreshold: item.reorder_threshold,
    expiryDate: item.expiry_date,
    isExpired: isExpired(item.expiry_date, todayIso),
    notInCatalogue: !item.matched_drug,
  };
}

// Maps 'low_stock' (types.ts naming, matches the DB-derived computed_status)
// to 'low' (the v0 component's DrugStatus naming) — everything else is a
// direct passthrough.
function mapInventoryStatusToDrugStatus(
  status: PharmacyInventoryItem["computed_status"]
): DrugStatus {
  return status === "low_stock" ? "low" : status;
}

export function mapInventoryItemToDrugRow(item: PharmacyInventoryItem): DrugRow {
  return {
    id: item.drug.id,
    name: item.drug.name,
    genericName: item.drug.generic_name ?? undefined,
    form: PHARMACY_DRUG_FORM_LABELS[item.drug.form],
    strength: item.drug.strength ?? undefined,
    onHand: item.inventory?.quantity_on_hand ?? null,
    reorderThreshold: item.inventory?.reorder_threshold ?? null,
    expiryDate: item.inventory?.expiry_date ?? undefined,
    // Stored as integer paise (Rupee convention); UI works in rupees.
    // No shared formatINR() helper exists in this codebase (confirmed via
    // search) — plain "₹" + toFixed(2) is the project's actual convention,
    // used consistently in pharmacy-inventory.tsx.
    unitPriceRupees: item.inventory?.unit_price_paise != null
      ? item.inventory.unit_price_paise / 100
      : null,
    status: mapInventoryStatusToDrugStatus(item.computed_status),
    isActive: item.drug.is_active,
  };
}

// Re-exported so callers building an AddDrugValues -> CreateDrugInput mapping
// have the canonical form type available without a second import path.
export type { PharmacyDrugForm };

// [... all existing mapQueueItemToPendingPrescription, mapQueueItemToDispensePrescription,
//      mapInventoryStatusToDrugStatus, mapInventoryItemToDrugRow unchanged ...]

// ---------------------------------------------------------------------------
// Chat C — groups pending queue items sharing one encounter_id into the
// shape encounter-bill-drawer.tsx renders. Called from the dashboard client
// after finding all items matching a clicked row's encounter_id.
// ---------------------------------------------------------------------------

import type { EncounterBillLine, EncounterBillGroup } from "./components/encounter-bill-drawer";

export function mapQueueItemsToEncounterBill(
  items: PharmacyQueueItem[],
  todayIso: string
): EncounterBillGroup {
  const first = items[0];
  const lines: EncounterBillLine[] = items.map((item) => ({
    prescriptionId: item.prescription.id,
    drugId: item.matched_drug?.id ?? null,
    drugName: item.matched_drug?.name ?? item.prescription.medicine_name,
    strength: item.matched_drug?.strength ?? undefined,
    form: item.matched_drug ? PHARMACY_DRUG_FORM_LABELS[item.matched_drug.form] : undefined,
    dosage: item.prescription.dosage ?? undefined,
    frequency: item.prescription.frequency ?? undefined,
    duration: item.prescription.duration ?? undefined,
    stockOnHand: item.current_stock,
    unitPriceRupees: item.unit_price_paise != null ? item.unit_price_paise / 100 : null,
    isExpired: isExpired(item.expiry_date, todayIso),
    notInCatalogue: !item.matched_drug,
  }));

  return {
    encounterId: first.prescription.encounter_id,
    patientId: first.prescription.patient_id,
    patientName: first.patient_name,
    doctorName: first.prescriber_name,
    lines,
  };
}