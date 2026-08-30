// src/features/pharmacy/components/pharmacy-dashboard-client.tsx
//
// Chat C: encounter-grouped dispense + bill + payment collection. Clicking
// any pending-prescription row gathers every queue item sharing that row's
// encounter_id and opens them together in EncounterBillDrawer — "one
// receipt per visit" (objective 4). Payment method is required and actually
// recorded as a payment_collections row, so the bill is marked paid at
// dispense rather than staying permanently unpaid. todayIso is passed down
// to the drawer so its substitute-medicine picker can compute expiry status
// from the server's date, not the browser clock.
//
// onLineRejected: when a line is rejected inside the drawer, it's removed
// from the drawer's local list immediately for instant feedback, and this
// triggers a router.refresh() so the underlying queue data (and summary
// counts) catch up on the next render — same pattern as a successful
// dispense.

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import PharmacyDashboard, { type PendingPrescription } from "./pharmacy-dashboard";
import EncounterBillDrawer, { type EncounterBillSubmitPayload } from "./encounter-bill-drawer";
import { dispenseAndBillEncounter } from "../actions";
import type { PharmacyQueueItem, PharmacyDashboardSummary, PharmacyDispensedTodayItem } from "../types";
import { mapQueueItemToPendingPrescription, mapQueueItemsToEncounterBill } from "../mappers";

interface PharmacyDashboardClientProps {
  summary: PharmacyDashboardSummary;
  queue: PharmacyQueueItem[];
  dispensedToday: PharmacyDispensedTodayItem[];
  todayIso: string;
}

export default function PharmacyDashboardClient({
  summary,
  queue,
  dispensedToday,
  todayIso,
}: PharmacyDashboardClientProps) {
  const router = useRouter();
  const [selectedEncounterId, setSelectedEncounterId] = useState<string | null>(null);
  const [isSubmitting, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const pending: PendingPrescription[] = queue.map((item) =>
    mapQueueItemToPendingPrescription(item, todayIso)
  );

  const dispensedItems = dispensedToday.map((item) => ({
    id: item.id,
    patientName: item.patient_name,
    drugName: item.drug_name,
    quantity: item.quantity_dispensed,
    dispensedAt: item.dispensed_at,
  }));

  const summaryForCard = {
    pending: summary.pending_prescriptions_count,
    dispensedToday: summary.dispensed_today_count,
    lowStock: summary.low_stock_count,
    expiringSoon: summary.expiring_soon_count,
  };

  const encounterItems = selectedEncounterId
    ? queue.filter((item) => item.prescription.encounter_id === selectedEncounterId)
    : [];
  const encounterGroup = encounterItems.length > 0 ? mapQueueItemsToEncounterBill(encounterItems, todayIso) : undefined;

  function handleRowClick(prescription: PendingPrescription) {
    const item = queue.find((q) => q.prescription.id === prescription.id);
    if (!item) return;
    setErrorMessage(null);
    setSuccessMessage(null);
    setSelectedEncounterId(item.prescription.encounter_id);
  }

  async function handleSubmit(payload: EncounterBillSubmitPayload) {
    setErrorMessage(null);
    setSuccessMessage(null);

    startTransition(async () => {
      const result = await dispenseAndBillEncounter({
        encounter_id: payload.encounterId,
        patient_id: payload.patientId,
        lines: payload.lines.map((l) => ({
          prescription_id: l.prescriptionId,
          drug_id: l.drugId,
          quantity: l.quantity,
          confirm_expired: l.confirmExpired,
        })),
        final_amount: payload.finalAmount,
        payment_method: payload.paymentMethod,
      });

      if (!result.ok) {
        setErrorMessage(result.error);
        return;
      }

      setSelectedEncounterId(null);

      const parts = [`Receipt ${result.data.receiptNumber}: ${result.data.dispensedCount} medicine(s) dispensed and billed.`];
      if (!result.data.collected) {
        parts.push("Payment could not be recorded automatically — record it manually from Payments.");
      }
      if (result.data.discounted) parts.push("Bill was discounted from the computed subtotal.");
      if (result.data.failedLines.length > 0) {
        parts.push(`${result.data.failedLines.length} line(s) could not be dispensed: ${result.data.failedLines.map((f) => f.error).join("; ")}`);
      }
      setSuccessMessage(parts.join(" "));

      router.refresh();
    });
  }

  function handleLineRejected() {
    router.refresh();
  }

  return (
    <>
      <PharmacyDashboard
        summary={summaryForCard}
        pending={pending}
        dispensedToday={dispensedItems}
        onRowClick={handleRowClick}
      />

      {encounterGroup && (
        <EncounterBillDrawer
          open={selectedEncounterId !== null}
          onOpenChange={(open) => {
            if (!open) setSelectedEncounterId(null);
          }}
          group={encounterGroup}
          todayIso={todayIso}
          isSubmitting={isSubmitting}
          onSubmit={handleSubmit}
          onLineRejected={handleLineRejected}
        />
      )}

      {errorMessage && (
        <div
          role="alert"
          className="fixed bottom-4 right-4 z-50 max-w-sm rounded-lg border border-destructive bg-destructive/10 px-4 py-3 text-sm text-destructive shadow-lg"
        >
          {errorMessage}
        </div>
      )}
      {successMessage && (
        <div
          role="status"
          className="fixed bottom-4 right-4 z-50 max-w-sm rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 shadow-lg dark:text-emerald-400"
        >
          {successMessage}
        </div>
      )}
    </>
  );
}