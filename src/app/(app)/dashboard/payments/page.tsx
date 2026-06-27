// src/app/(app)/dashboard/payments/page.tsx

export const dynamic = 'force-dynamic';

import { getOrCreateProfile } from '@/lib/supabase/profile';
import {
  getPaymentsDashboardData,
  getApprovedOutstandingCharges,
  getActivePatientsForCharge,
} from '@/features/payments/actions';
import PaymentsDashboardClient from '@/features/payments/components/payments-dashboard-client';

export default async function PaymentsPage() {
  const profile = await getOrCreateProfile();

  const [{ payments, metrics, byMode }, approvedCharges, patients] = await Promise.all([
    getPaymentsDashboardData(),
    getApprovedOutstandingCharges(),
    getActivePatientsForCharge(),
  ]);

  return (
    <PaymentsDashboardClient
      payments={payments}
      metrics={metrics}
      byMode={byMode}
      approvedCharges={approvedCharges}
      patients={patients}
      userRole={(profile?.role as 'doctor' | 'staff' | 'patient') || 'patient'}
    />
  );
}