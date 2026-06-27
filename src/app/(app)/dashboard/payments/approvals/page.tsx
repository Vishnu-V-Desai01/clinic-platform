// src/app/(app)/dashboard/payments/approvals/page.tsx

export const dynamic = 'force-dynamic';

import { getOrCreateProfile } from '@/lib/supabase/profile';
import {
  getPendingApprovalPayments,
  getActivePatientsForCharge,
} from '@/features/payments/actions';
import ChargeApprovalsClient from '@/features/payments/components/charge-approvals-client';

export default async function ChargeApprovalsPage() {
  const profile = await getOrCreateProfile();

  const [charges, patients] = await Promise.all([
    getPendingApprovalPayments(),
    getActivePatientsForCharge(),
  ]);

  return (
    <ChargeApprovalsClient
      charges={charges}
      patients={patients}
      userRole={(profile?.role as 'doctor' | 'staff' | 'patient') || 'patient'}
    />
  );
}