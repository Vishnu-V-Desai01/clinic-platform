// src/app/(app)/dashboard/payments/page.tsx

export const dynamic = 'force-dynamic';

import { requireRole } from '@/lib/supabase/profile';
import {
  getPaymentsDashboardData,
  getApprovedOutstandingCharges,
  getActivePatientsForCharge,
} from '@/features/payments/actions';
import { listDoctors } from '@/features/appointments/actions';
import PaymentsDashboardClient from '@/features/payments/components/payments-dashboard-client';

export default async function PaymentsPage() {
  const profile = await requireRole('doctor', 'staff');

  const [{ payments, metrics, byMode }, approvedCharges, patients, doctorsResult] =
    await Promise.all([
      getPaymentsDashboardData(),
      getApprovedOutstandingCharges(),
      getActivePatientsForCharge(),
      listDoctors(),
    ]);

  const doctorOptions = doctorsResult.success ? doctorsResult.data : [];

  return (
    <PaymentsDashboardClient
      payments={payments}
      metrics={metrics}
      byMode={byMode}
      approvedCharges={approvedCharges}
      patients={patients}
      doctorOptions={doctorOptions}
      userRole={profile.role}
    />
  );
}