// src/features/payments/components/patient-payment-summary.tsx

import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getOrCreateProfile } from '@/lib/supabase/profile';
import { Badge } from '@/components/ui/badge';
import { FileText } from 'lucide-react';

interface PatientPaymentSummaryProps {
  patientId: string;
}

function formatINR(amount: number): string {
  return `₹${Number(amount).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function getStatusBadge(payment: any): { label: string; className: string } {
  if (payment.approval_status === 'pending')
    return {
      label: 'Pending Approval',
      className: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
    };
  if (payment.approval_status === 'rejected')
    return { label: 'Rejected', className: 'bg-destructive/15 text-destructive' };
  if (payment.approval_status === 'void')
    return { label: 'Void', className: 'bg-destructive/15 text-destructive' };
  if (payment.payment_status === 'paid')
    return {
      label: 'Paid',
      className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
    };
  if (payment.payment_status === 'partial')
    return {
      label: 'Partially Paid',
      className: 'bg-sky-500/15 text-sky-700 dark:text-sky-400',
    };
  return { label: 'Unpaid', className: 'bg-muted text-muted-foreground' };
}

export default async function PatientPaymentSummary({
  patientId,
}: PatientPaymentSummaryProps) {
  const supabase = createServerSupabaseClient();
  const profile = await getOrCreateProfile();

  if (!profile || !['doctor', 'staff'].includes(profile.role)) {
    return null;
  }

  const { data: payments, error } = await supabase
    .from('payments')
    .select(
      `
      id,
      amount_charged,
      amount_paid,
      outstanding_balance,
      payment_status,
      approval_status,
      description,
      created_at,
      appointments (appointment_date)
    `
    )
    .eq('patient_id', patientId)
    .eq('clinic_id', profile.clinic_id)
    .not('approval_status', 'in', '("rejected","void")')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[PatientPaymentSummary]', error);
    return (
      <p className="text-sm text-muted-foreground py-4">
        Unable to load payment data.
      </p>
    );
  }

  const rows = payments || [];

  const totalCharged = rows.reduce(
    (s: number, p: any) => s + (Number(p.amount_charged) || 0),
    0
  );
  const totalPaid = rows.reduce(
    (s: number, p: any) => s + (Number(p.amount_paid) || 0),
    0
  );
  const totalOutstanding = rows.reduce(
    (s: number, p: any) => s + (Number(p.outstanding_balance) || 0),
    0
  );

  if (rows.length === 0) {
    return (
      <div className="py-8 text-center">
        <p className="text-muted-foreground text-sm">No charges recorded yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary cards */}
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
          <p
            className={
              'text-xl font-bold mt-1 ' +
              (totalOutstanding > 0
                ? 'text-destructive'
                : 'text-emerald-600 dark:text-emerald-400')
            }
          >
            {formatINR(totalOutstanding)}
          </p>
        </div>
      </div>

      {/* Charge list */}
      <div className="space-y-3">
        {rows.map((payment: any) => {
          const badge = getStatusBadge(payment);
          const serviceLabel = payment.description || 'Consultation';
          const chargeDate = payment.appointments?.appointment_date
            ? new Date(payment.appointments.appointment_date).toLocaleDateString(
                'en-IN'
              )
            : new Date(payment.created_at).toLocaleDateString('en-IN');

          return (
            <div
              key={payment.id}
              className="flex items-center justify-between border border-border rounded-lg p-4 bg-card gap-4"
            >
              {/* Left: icon + service + date */}
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

              {/* Right: amount + badge + receipt link */}
              <div className="flex items-center gap-4 flex-shrink-0">
                <div className="text-right">
                  <p className="text-sm font-semibold text-foreground">
                    {formatINR(Number(payment.amount_charged))}
                  </p>
                  {Number(payment.outstanding_balance) > 0 &&
                    payment.approval_status === 'approved' && (
                      <p className="text-xs text-destructive">
                        Due: {formatINR(Number(payment.outstanding_balance))}
                      </p>
                    )}
                </div>

                <Badge
                  variant="secondary"
                  className={badge.className + ' border-0 text-xs'}
                >
                  {badge.label}
                </Badge>

                {payment.approval_status === 'approved' && (
                  <Link
                    href={'/api/payments/' + payment.id + '/receipt'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline flex-shrink-0"
                  >
                    Receipt
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}