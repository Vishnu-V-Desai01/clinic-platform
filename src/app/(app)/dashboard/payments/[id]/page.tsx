// src/app/(app)/payments/[id]/page.tsx

import { notFound } from 'next/navigation';
import { getOrCreateProfile } from '@/lib/supabase/profile';
import { getPaymentWithCollections } from '@/features/payments/actions';
import { listPaymentDocuments } from '@/features/payments/document-storage';
import PaymentDocumentsClient from '@/features/payments/components/payment-documents-client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

function formatINR(amount: number): string {
  return `₹${amount.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(isoString: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(isoString));
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
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

  const [payment, documents] = await Promise.all([
    getPaymentWithCollections(id),
    listPaymentDocuments(id),
  ]);

  if (!payment) {
    notFound();
  }

  const canManage = profile?.role === 'doctor' || profile?.role === 'staff';

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Payment Details</h1>
          <p className="text-sm text-muted-foreground mt-1">Payment ID: {payment.id}</p>
        </div>

        <Card className="bg-card border-border p-6 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Status</p>
            <Badge variant="secondary" className="capitalize">
              {payment.approval_status === 'approved'
                ? payment.payment_status
                : payment.approval_status}
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
              <p className="text-lg font-semibold text-foreground">
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
        </Card>

        {payment.payment_collections && payment.payment_collections.length > 0 && (
          <Card className="bg-card border-border p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">
              Collection History
            </h2>
            <div className="space-y-3">
              {payment.payment_collections.map((collection) => (
                <div
                  key={collection.id}
                  className="flex items-center justify-between border-b border-border pb-3 last:border-0 last:pb-0"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {formatINR(collection.amount_collected)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(collection.collection_date)} ·{' '}
                      {PAYMENT_METHOD_LABELS[collection.payment_method] ||
                        collection.payment_method}
                      {collection.transaction_reference &&
                        ` · Ref: ${collection.transaction_reference}`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        <PaymentDocumentsClient
          paymentId={payment.id}
          documents={documents}
          canManage={canManage}
        />
      </div>
    </div>
  );
}