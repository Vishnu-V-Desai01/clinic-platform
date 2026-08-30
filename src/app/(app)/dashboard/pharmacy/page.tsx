// src/app/(app)/dashboard/pharmacy/page.tsx

import { requireRole } from "@/lib/supabase/profile";
import {
  getPharmacyDashboardSummary,
  getPharmacyQueue,
  getDispensedToday,
} from "@/features/pharmacy/actions";
import PharmacyDashboardClient from "@/features/pharmacy/components/pharmacy-dashboard-client";
import { todayIsoDateIst } from "@/features/pharmacy/ist";

export const dynamic = "force-dynamic";

export default async function PharmacyPage() {
  // requireRole redirects immediately if the caller isn't doctor/staff.
  // Each server action below independently re-checks pharmacy_access — this
  // call is a fast, friendly early gate, not the only enforcement.
  await requireRole("doctor", "staff");

  const [summaryResult, queueResult, dispensedResult] = await Promise.all([
    getPharmacyDashboardSummary(),
    getPharmacyQueue(),
    getDispensedToday(),
  ]);

  // Two distinct "can't show the dashboard" states, checked in priority
  // order: the clinic never turned the module on (more fundamental) vs. this
  // specific person hasn't been granted access to a module that does exist.
  if (!summaryResult.ok && summaryResult.code === "PHARMACY_DISABLED") {
    return (
      <main className="mx-auto flex w-full max-w-7xl flex-col items-center gap-2 p-4 py-16 text-center sm:p-6 lg:p-8">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Pharmacy</h1>
        <p className="text-sm text-muted-foreground">
          The pharmacy module isn&apos;t enabled for this clinic yet.
        </p>
      </main>
    );
  }

  if (!summaryResult.ok && summaryResult.code === "PHARMACY_ACCESS_NOT_GRANTED") {
    return (
      <main className="mx-auto flex w-full max-w-7xl flex-col items-center gap-2 p-4 py-16 text-center sm:p-6 lg:p-8">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Pharmacy</h1>
        <p className="text-sm text-muted-foreground">Pharmacy inventory access not provided.</p>
      </main>
    );
  }

  if (!summaryResult.ok || !queueResult.ok || !dispensedResult.ok) {
    const error = !summaryResult.ok
      ? summaryResult.error
      : !queueResult.ok
        ? queueResult.error
        : !dispensedResult.ok
          ? dispensedResult.error
          : "Something went wrong loading the pharmacy dashboard.";

    return (
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-2 p-4 sm:p-6 lg:p-8">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Pharmacy</h1>
        <p className="text-sm text-destructive">{error}</p>
      </main>
    );
  }

  return (
    <PharmacyDashboardClient
      summary={summaryResult.data}
      queue={queueResult.data}
      dispensedToday={dispensedResult.data}
      todayIso={todayIsoDateIst()}
    />
  );
}