// src/app/(app)/dashboard/payments/approvals/page.tsx

export const dynamic = 'force-dynamic';

import { requireRole } from '@/lib/supabase/profile';
import {
  getPendingApprovalPayments,
  getActivePatientsForCharge,
} from '@/features/payments/actions';
import { listDoctors } from '@/features/appointments/actions';
import ChargeApprovalsClient from '@/features/payments/components/charge-approvals-client';

export default async function ChargeApprovalsPage() {
  const profile = await requireRole('doctor', 'staff');

  const [charges, patients, doctorsResult] = await Promise.all([
    getPendingApprovalPayments(),
    getActivePatientsForCharge(),
    listDoctors(),
  ]);

  const doctorOptions = doctorsResult.success ? doctorsResult.data : [];

  return (
    <ChargeApprovalsClient
      charges={charges}
      patients={patients}
      doctorOptions={doctorOptions}
      userRole={profile.role}
    />
  );
}