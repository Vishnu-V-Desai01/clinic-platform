// src/app/(app)/dashboard/pharmacy/inventory/page.tsx

import Link from "next/link";
import { requireRole } from "@/lib/supabase/profile";
import { listInventory } from "@/features/pharmacy/actions";
import PharmacyInventoryClient from "@/features/pharmacy/components/pharmacy-inventory-client";

export const dynamic = "force-dynamic";

export default async function PharmacyInventoryPage() {
  await requireRole("doctor", "staff");

  const result = await listInventory({ include_inactive: true });

  if (!result.ok && result.code === "PHARMACY_DISABLED") {
    return (
      <main className="mx-auto flex w-full max-w-7xl flex-col items-center gap-2 p-4 py-16 text-center sm:p-6 lg:p-8">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Inventory</h1>
        <p className="text-sm text-muted-foreground">
          The pharmacy module isn&apos;t enabled for this clinic yet.
        </p>
      </main>
    );
  }

  if (!result.ok && result.code === "PHARMACY_ACCESS_NOT_GRANTED") {
    return (
      <main className="mx-auto flex w-full max-w-7xl flex-col items-center gap-2 p-4 py-16 text-center sm:p-6 lg:p-8">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Inventory</h1>
        <p className="text-sm text-muted-foreground">Pharmacy inventory access not provided.</p>
      </main>
    );
  }

  if (!result.ok) {
    return (
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-2 p-4 sm:p-6 lg:p-8">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Inventory</h1>
        <p className="text-sm text-destructive">{result.error}</p>
      </main>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="mx-auto w-full max-w-7xl px-4 pt-4 sm:px-6 lg:px-8">
        <Link href="/dashboard/pharmacy" className="text-sm text-muted-foreground hover:text-foreground">
          ← Pharmacy dashboard
        </Link>
      </div>
      <PharmacyInventoryClient items={result.data} />
    </div>
  );
}