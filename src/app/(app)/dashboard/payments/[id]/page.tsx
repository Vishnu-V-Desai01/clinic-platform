// src/app/(app)/dashboard/payments/[id]/page.tsx

export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getOrCreateProfile } from '@/lib/supabase/profile';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FileText, Download } from 'lucide-react';
import EditBillDialog from '@/features/payments/components/edit-bill-dialog-client';
import type { PaymentLineItem } from '@/features/payments/types';

function formatINR(amount: number): string {
  return (
    'Rs. ' +
    Number(amount).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

function formatDate(isoString: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(isoString));
}

const METHOD_LABELS: Record<string, string> = {
  cash: 'Cash',
  card: 'Card',
  upi: 'UPI',
  bank_transfer: 'Bank Transfer',
  check: 'Cheque',
  other: 'Other',
};

export default async function PaymentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await getOrCreateProfile();

  if (!profile || !['doctor', 'staff'].includes(profile.role)) {
    notFound();
  }

  const supabase = createServerSupabaseClient();

  const { data: payment, error } = await supabase
    .from('payments')
    .select('*, payment_collections (*)')
    .eq('id', id)
    .eq('clinic_id', profile.clinic_id)
    .single();

  if (error || !payment) {
    console.error('[PaymentDetailPage]', error);
    notFound();
  }

  // Fetch line items
  const { data: lineItemsData } = await supabase
    .from('payment_line_items')
    .select('*')
    .eq('payment_id', id)
    .eq('clinic_id', profile.clinic_id)
    .order('sort_order', { ascending: true });

  const lineItems = (lineItemsData || []) as PaymentLineItem[];
  const hasLineItems = lineItems.length > 0;
  const collections = payment.payment_collections || [];
  const isApproved  = payment.approval_status === 'approved';
  const receiptUrl   = '/api/payments/' + id + '/receipt';
  const treatmentUrl = '/api/payments/' + id + '/treatment';

  const statusLabel =
    payment.approval_status === 'approved'
      ? payment.payment_status
      : payment.approval_status;

  const statusColor =
    payment.payment_status === 'paid' && isApproved
      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
      : payment.approval_status === 'pending'
      ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
      : payment.approval_status === 'rejected'
      ? 'bg-destructive/15 text-destructive'
      : payment.payment_status === 'partial'
      ? 'bg-sky-500/15 text-sky-700 dark:text-sky-400'
      : 'bg-muted text-muted-foreground';

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-3xl mx-auto space-y-6">

        {/* Page heading */}
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Payment Details</h1>
          <p className="text-xs text-muted-foreground mt-1 font-mono">ID: {id}</p>
          {payment.receipt_number ? (
            <p className="text-xs text-muted-foreground mt-0.5 font-mono">
              Receipt No: {payment.receipt_number}
            </p>
          ) : null}
        </div>

        {/* ── Summary ──────────────────────────────────────────── */}
        <Card className="bg-card border-border p-6 space-y-5">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Status</p>
            <Badge
              variant="secondary"
              className={statusColor + ' border-0 capitalize'}
            >
              {statusLabel}
            </Badge>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Amount Charged</p>
              <p className="text-lg font-semibold text-foreground">
                {formatINR(payment.amount_charged)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Amount Paid</p>
              <p className="text-lg font-semibold text-foreground">
                {formatINR(payment.amount_paid)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Outstanding</p>
              <p
                className={
                  'text-lg font-semibold ' +
                  (payment.outstanding_balance > 0
                    ? 'text-destructive'
                    : 'text-emerald-600 dark:text-emerald-400')
                }
              >
                {formatINR(payment.outstanding_balance)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Created</p>
              <p className="text-lg font-semibold text-foreground">
                {formatDate(payment.created_at)}
              </p>
            </div>
          </div>

          {payment.description && !hasLineItems ? (
            <div>
              <p className="text-xs text-muted-foreground">Description</p>
              <p className="text-sm text-foreground mt-0.5">{payment.description}</p>
            </div>
          ) : null}

          {payment.approval_notes ? (
            <div>
              <p className="text-xs text-muted-foreground">Notes</p>
              <p className="text-sm text-foreground mt-0.5">{payment.approval_notes}</p>
            </div>
          ) : null}

          {isApproved ? (
            <div className="pt-2 border-t border-border">
              <Link
                href={receiptUrl}
                target="_blank"
                className="text-sm text-primary hover:underline"
              >
                Download Receipt (PDF)
              </Link>
            </div>
          ) : null}
        </Card>

        {/* ── Bill Breakdown ────────────────────────────────────── */}
        <Card className="bg-card border-border p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-base font-semibold text-foreground">Bill Breakdown</h2>
            <EditBillDialog
              paymentId={id}
              initialLineItems={lineItems}
              amountPaid={payment.amount_paid}
            />
          </div>

          {hasLineItems ? (
            <div>
              {/* Header row */}
              <div className="grid grid-cols-[1fr_48px_100px_80px] gap-3 pb-2 border-b border-border">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Service
                </span>
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide text-center">
                  Qty
                </span>
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide text-right">
                  Unit Price
                </span>
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide text-right">
                  Total
                </span>
              </div>

              {/* Item rows */}
              <div className="divide-y divide-border">
                {lineItems.map((item) => (
                  <div
                    key={item.id}
                    className="grid grid-cols-[1fr_48px_100px_80px] gap-3 py-3"
                  >
                    <p className="text-sm text-foreground">{item.description}</p>
                    <p className="text-sm text-muted-foreground text-center">
                      {item.quantity}
                    </p>
                    <p className="text-sm text-muted-foreground text-right">
                      {formatINR(item.unit_price)}
                    </p>
                    <p className="text-sm font-medium text-foreground text-right">
                      {formatINR(item.total_price)}
                    </p>
                  </div>
                ))}
              </div>

              {/* Total row */}
              {lineItems.length > 1 && (
                <div className="grid grid-cols-[1fr_48px_100px_80px] gap-3 pt-3 border-t border-border">
                  <p className="text-sm font-semibold text-foreground col-span-3 text-right">
                    Grand Total
                  </p>
                  <p className="text-sm font-bold text-foreground text-right">
                    {formatINR(payment.amount_charged)}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="py-4 text-center">
              <p className="text-sm text-muted-foreground">
                No line items recorded. Click{' '}
                <span className="font-medium text-foreground">Edit Bill</span> to add
                itemised services.
              </p>
            </div>
          )}
        </Card>

        {/* ── Collection history ───────────────────────────────── */}
        {collections.length > 0 ? (
          <Card className="bg-card border-border p-6">
            <h2 className="text-base font-semibold text-foreground mb-4">
              Collection History
            </h2>
            <div className="space-y-3">
              {collections.map((col: any) => (
                <div
                  key={col.id}
                  className="flex items-center justify-between border-b border-border pb-3 last:border-0 last:pb-0"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {formatINR(col.amount_collected)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatDate(col.collection_date)}
                      {' \u00b7 '}
                      {METHOD_LABELS[col.payment_method] || col.payment_method}
                      {col.transaction_reference
                        ? ' \u00b7 UTR: ' + col.transaction_reference
                        : ''}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        ) : null}

        {/* ── Documents ────────────────────────────────────────── */}
        <Card className="bg-card border-border p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="bg-primary/10 text-primary rounded-lg p-2">
              <FileText className="w-5 h-5" />
            </div>
            <h2 className="text-base font-semibold text-foreground">Documents</h2>
          </div>

          {isApproved ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between border border-border rounded-lg p-4 bg-background">
                <div>
                  <p className="text-sm font-medium text-foreground">Payment Receipt</p>
                  <p className="text-xs text-muted-foreground">
                    Itemised fee breakdown and collection history
                  </p>
                </div>
                <Link
                  href={receiptUrl}
                  target="_blank"
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Download
                </Link>
              </div>
              <div className="flex items-center justify-between border border-border rounded-lg p-4 bg-background">
                <div>
                  <p className="text-sm font-medium text-foreground">Treatment Details</p>
                  <p className="text-xs text-muted-foreground">
                    Patient history, diagnoses and prescriptions
                  </p>
                </div>
                <Link
                  href={treatmentUrl}
                  target="_blank"
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Download
                </Link>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Documents are available after the charge is approved.
            </p>
          )}
        </Card>

      </div>
    </div>
  );
}