// src/features/payments/components/payment-documents-client.tsx

'use client';

import Link from 'next/link';
import { FileText, Download } from 'lucide-react';
import { Card } from '@/components/ui/card';
import type { Document } from '../types';

interface PaymentDocumentsClientProps {
  paymentId: string;
  documents: Document[];
  canManage: boolean;
  isApproved?: boolean;
}

export default function PaymentDocumentsClient({
  paymentId,
  isApproved = false,
}: PaymentDocumentsClientProps) {
  const docs = [
    {
      id: 'receipt',
      label: 'Payment Receipt',
      description: 'Fee breakdown and collection history',
      url: '/api/payments/' + paymentId + '/receipt',
    },
    {
      id: 'treatment',
      label: 'Treatment Details',
      description: 'Patient history, diagnoses and prescriptions',
      url: '/api/payments/' + paymentId + '/treatment',
    },
  ];

  return (
    <Card className="bg-card border-border">
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-4">
          <div className="bg-primary/10 text-primary rounded-lg p-3 flex-shrink-0">
            <FileText className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">Documents</h2>
        </div>

        {isApproved ? (
          <div className="space-y-3">
            {docs.map((doc) => (
              <div
                key={doc.id}
                className="border border-border rounded-lg p-4 bg-card hover:bg-muted/50 transition-colors"
              >
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <FileText className="w-5 h-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-foreground truncate">{doc.label}</p>
                      <p className="text-sm text-muted-foreground">{doc.description}</p>
                    </div>
                  </div>
                  <div className="flex-shrink-0">
                    <Link
                      href={doc.url}
                      target="_blank"
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
                    >
                      <Download className="w-4 h-4" />
                      Download
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-6 text-center">
            <p className="text-sm text-muted-foreground">
              Documents are available after the charge is approved.
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}