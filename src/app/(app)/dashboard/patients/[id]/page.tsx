// src/app/(app)/dashboard/patients/[id]/page.tsx

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FileText, CreditCard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getPatient } from '@/features/patients/actions';
import PatientProfile from '@/features/patients/patient-profile';
import ConsentSection from '@/features/consent/components/ConsentSection';
import { getEncountersForPatient } from '@/features/medical-records/actions';
import { listAppointments } from '@/features/appointments/actions';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getOrCreateProfile } from '@/lib/supabase/profile';

export const metadata = { title: 'Patient Profile' };

function formatINR(amount: number): string {
  return 'Rs. ' + Number(amount).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function getStatusBadge(payment: any): { label: string; className: string } {
  if (payment.approval_status === 'pending')
    return { label: 'Pending Approval', className: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' };
  if (payment.approval_status === 'rejected')
    return { label: 'Rejected', className: 'bg-destructive/15 text-destructive' };
  if (payment.approval_status === 'void')
    return { label: 'Void', className: 'bg-destructive/15 text-destructive' };
  if (payment.payment_status === 'paid')
    return { label: 'Paid', className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' };
  if (payment.payment_status === 'partial')
    return { label: 'Partially Paid', className: 'bg-sky-500/15 text-sky-700 dark:text-sky-400' };
  return { label: 'Unpaid', className: 'bg-muted text-muted-foreground' };
}

export default async function PatientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await getPatient(id);
  if (!result.success) notFound();

  const [encountersResult, appointmentsResult] = await Promise.all([
    getEncountersForPatient(id),
    listAppointments({ patientId: id }),
  ]);

  const recentEncounters =
    'data' in encountersResult ? encountersResult.data.slice(0, 5) : [];
  const recentAppointments = appointmentsResult.success
    ? appointmentsResult.data.slice(0, 5)
    : [];

  const profile = await getOrCreateProfile();
  let paymentRows: any[] = [];
  let totalCharged = 0;
  let totalPaid = 0;
  let totalOutstanding = 0;

  if (profile && ['doctor', 'staff'].includes(profile.role)) {
    const supabase = createServerSupabaseClient();
    const { data: payments } = await supabase
      .from('payments')
      .select(
        'id, amount_charged, amount_paid, outstanding_balance, payment_status, approval_status, description, created_at, appointments (appointment_date)'
      )
      .eq('patient_id', id)
      .eq('clinic_id', profile.clinic_id)
      .neq('approval_status', 'rejected')
      .neq('approval_status', 'void')
      .order('created_at', { ascending: false });

    paymentRows = payments || [];
    totalCharged = paymentRows.reduce((s, p) => s + (Number(p.amount_charged) || 0), 0);
    totalPaid = paymentRows.reduce((s, p) => s + (Number(p.amount_paid) || 0), 0);
    totalOutstanding = paymentRows.reduce((s, p) => s + (Number(p.outstanding_balance) || 0), 0);
  }

  const showPayments = Boolean(profile && ['doctor', 'staff'].includes(profile.role));
  const recordsUrl = '/dashboard/patients/' + id + '/records';

  return (
    <div className="space-y-6">

      <PatientProfile
        patient={result.data}
        recentEncounters={recentEncounters}
        recentAppointments={recentAppointments}
      />

      <Card>
        <CardContent className="flex items-center justify-between py-4">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
              <FileText className="size-5" />
            </div>
            <div>
              <p className="font-medium text-foreground">Medical Records</p>
              <p className="text-sm text-muted-foreground">
                Encounters, diagnoses, vitals, prescriptions and test results
              </p>
            </div>
          </div>
          <Button asChild variant="outline">
            <Link href={recordsUrl}>View Records</Link>
          </Button>
        </CardContent>
      </Card>

      {showPayments ? (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                <CreditCard className="size-5" />
              </div>
              <CardTitle className="text-base font-semibold">
                Payment Summary
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {paymentRows.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No charges recorded yet
              </p>
            ) : (
              <div className="space-y-6">

                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-muted rounded-lg p-4 border border-border">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                      Total Charged
                    </p>
                    <p className="text-xl font-bold text-foreground mt-1">
                      {formatINR(totalCharged)}
                    </p>
                  </div>
                  <div className="bg-muted rounded-lg p-4 border border-border">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                      Total Paid
                    </p>
                    <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                      {formatINR(totalPaid)}
                    </p>
                  </div>
                  <div className="bg-muted rounded-lg p-4 border border-border">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                      Outstanding
                    </p>
                    <p className={
                      'text-xl font-bold mt-1 ' +
                      (totalOutstanding > 0
                        ? 'text-destructive'
                        : 'text-emerald-600 dark:text-emerald-400')
                    }>
                      {formatINR(totalOutstanding)}
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  {paymentRows.map((payment: any) => {
                    const badge = getStatusBadge(payment);
                    const serviceLabel = payment.description || 'Consultation';
                    const chargeDate = payment.appointments?.appointment_date
                      ? new Date(payment.appointments.appointment_date).toLocaleDateString('en-IN')
                      : new Date(payment.created_at).toLocaleDateString('en-IN');
                    const receiptUrl = '/api/payments/' + payment.id + '/receipt';

                    return (
                      <div
                        key={payment.id}
                        className="flex items-center justify-between border border-border rounded-lg p-4 bg-card gap-4"
                      >
                        <div className="flex items-start gap-3 min-w-0">
                          <div className="bg-primary/10 text-primary rounded-lg p-2 flex-shrink-0">
                            <FileText className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-foreground text-sm truncate">
                              {serviceLabel}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {chargeDate}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 flex-shrink-0">
                          <div className="text-right">
                            <p className="text-sm font-semibold text-foreground">
                              {formatINR(Number(payment.amount_charged))}
                            </p>
                            {Number(payment.outstanding_balance) > 0 &&
                              payment.approval_status === 'approved' ? (
                              <p className="text-xs text-destructive">
                                Due: {formatINR(Number(payment.outstanding_balance))}
                              </p>
                            ) : null}
                          </div>
                          <Badge
                            variant="secondary"
                            className={badge.className + ' border-0 text-xs'}
                          >
                            {badge.label}
                          </Badge>
                          {payment.approval_status === 'approved' ? (
                            <Link
                              href={receiptUrl}
                              target="_blank"
                              className="text-xs text-primary hover:underline flex-shrink-0"
                            >
                              Receipt
                            </Link>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>

              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      <ConsentSection patientId={id} />

    </div>
  );
}