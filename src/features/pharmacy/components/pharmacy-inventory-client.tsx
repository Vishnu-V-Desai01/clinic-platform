// src/features/pharmacy/components/pharmacy-inventory-client.tsx
//
// Client boundary for the Inventory page. Chat B addition: price handling
// (objective 2) — a new inline-edit handler that calls updateInventoryDetails
// with unit_price_paise, and unitPriceRupees threaded through the Stock-now
// dialog into initializeInventory.

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import PharmacyInventory, {
  type DrugRow,
  type AddDrugValues,
  type AddStockValues,
} from "./pharmacy-inventory";
import { createDrug, initializeInventory, adjustStock, updateInventoryDetails } from "../actions";
import type { PharmacyInventoryItem } from "../types";
import { mapInventoryItemToDrugRow } from "../mappers";

interface PharmacyInventoryClientProps {
  items: PharmacyInventoryItem[];
}

// Empty-string form fields (from uncontrolled-feeling text inputs) should
// become "not provided" rather than fail Zod's non-blank validation.
function trimmedOrUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export default function PharmacyInventoryClient({ items }: PharmacyInventoryClientProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const drugRows: DrugRow[] = items.map(mapInventoryItemToDrugRow);
  const onHandByDrugId = new Map(items.map((item) => [item.drug.id, item.inventory?.quantity_on_hand ?? null]));
  const priceByDrugId = new Map(
    items.map((item) => [item.drug.id, item.inventory?.unit_price_paise != null ? item.inventory.unit_price_paise / 100 : null])
  );

  async function handleAddDrug(values: AddDrugValues) {
    setErrorMessage(null);
    const result = await createDrug({
      name: values.name,
      generic_name: trimmedOrUndefined(values.genericName),
      form: values.form,
      strength: trimmedOrUndefined(values.strength),
      unit: trimmedOrUndefined(values.unit),
    });

    if (!result.ok) {
      setErrorMessage(result.error);
      return;
    }
    router.refresh();
  }

  async function handleInitializeStock(values: AddStockValues) {
    setErrorMessage(null);
    const result = await initializeInventory({
      drug_id: values.drugId,
      quantity_on_hand: values.quantityOnHand,
      reorder_threshold: values.reorderThreshold,
      expiry_date: values.expiryDate,
      unit_price_paise: values.unitPriceRupees != null ? Math.round(values.unitPriceRupees * 100) : undefined,
    });

    if (!result.ok) {
      setErrorMessage(result.error);
      return;
    }
    router.refresh();
  }

  function handleUpdateOnHand(drugId: string, newOnHand: number) {
    const currentOnHand = onHandByDrugId.get(drugId);
    if (currentOnHand === null || currentOnHand === undefined) return; // not stocked yet — inline edit shouldn't fire here
    const delta = newOnHand - currentOnHand;
    if (delta === 0) return;

    setErrorMessage(null);
    startTransition(async () => {
      const result = await adjustStock({
        drug_id: drugId,
        delta,
        reason: "manual_correction",
        notes: "Inline stock count edit.",
      });

      if (!result.ok) {
        setErrorMessage(result.error);
        return;
      }
      router.refresh();
    });
  }

  function handleUpdatePrice(drugId: string, newPriceRupees: number) {
    const currentPrice = priceByDrugId.get(drugId);
    if (currentPrice === undefined) return; // not stocked yet — price edit shouldn't fire here
    if (currentPrice !== null && newPriceRupees === currentPrice) return;

    setErrorMessage(null);
    startTransition(async () => {
      const result = await updateInventoryDetails({
        drug_id: drugId,
        unit_price_paise: Math.round(newPriceRupees * 100),
      });

      if (!result.ok) {
        setErrorMessage(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <>
      <PharmacyInventory
        drugs={drugRows}
        onAddDrug={handleAddDrug}
        onUpdateOnHand={handleUpdateOnHand}
        onInitializeStock={handleInitializeStock}
        onUpdatePrice={handleUpdatePrice}
      />

      {errorMessage && (
        <div
          role="alert"
          className="fixed bottom-4 right-4 z-50 max-w-sm rounded-lg border border-destructive bg-destructive/10 px-4 py-3 text-sm text-destructive shadow-lg"
        >
          {errorMessage}
        </div>
      )}
    </>
  );
}