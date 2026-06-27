// src/features/payments/components/payment-documents-client.tsx

'use client';

import React, { useState } from 'react';
import { FileText, Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  getDocumentDownloadUrl,
  generateAndStorePaymentDocuments,
} from '../document-storage';
import type { Document } from '../types';

interface PaymentDocumentsClientProps {
  paymentId: string;
  documents: Document[];
  canManage: boolean;
}

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  receipt: 'Payment Receipt',
  treatment_details: 'Treatment Details',
};

function formatDate(isoString: string) {
  const formatter = new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  return formatter.format(new Date(isoString));
}

function formatSize(bytes: number | null) {
  if (!bytes) return '';
  const kb = bytes / 1024;
  return kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${Math.round(kb)} KB`;
}

export default function PaymentDocumentsClient({
  paymentId,
  documents,
  canManage,
}: PaymentDocumentsClientProps) {
  const [localDocuments, setLocalDocuments] = useState(documents);
  const [generatingState, setGeneratingState] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const hasReceipt = localDocuments.some((d) => d.document_type === 'receipt');
  const hasTreatmentDetails = localDocuments.some(
    (d) => d.document_type === 'treatment_details'
  );

  const handleDownload = async (documentId: string) => {
    setDownloadingId(documentId);
    const url = await getDocumentDownloadUrl(documentId);
    setDownloadingId(null);
    if (url) {
      window.open(url, '_blank');
    }
  };

  const handleGenerate = async () => {
    setGeneratingState(true);
    const generated = await generateAndStorePaymentDocuments(paymentId);
    setGeneratingState(false);
    if (generated.length > 0) {
      setLocalDocuments((prev) => [...prev, ...generated]);
    }
  };

  const displayRows: {
    id: string;
    type: string;
    status: 'generated' | 'not_generated' | 'generating';
    generatedAt?: string;
    sizeLabel?: string;
  }[] = [];

  localDocuments.forEach((doc) => {
    displayRows.push({
      id: doc.id,
      type: DOCUMENT_TYPE_LABELS[doc.document_type] || doc.document_type,
      status: 'generated',
      generatedAt: doc.created_at,
      sizeLabel: formatSize(doc.file_size_bytes),
    });
  });

  if (!hasReceipt) {
    displayRows.push({
      id: 'placeholder-receipt',
      type: 'Payment Receipt',
      status: generatingState ? 'generating' : 'not_generated',
    });
  }

  if (!hasTreatmentDetails) {
    displayRows.push({
      id: 'placeholder-treatment',
      type: 'Treatment Details',
      status: generatingState ? 'generating' : 'not_generated',
    });
  }

  return (
    <Card className="bg-card border-border">
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-4">
          <div className="bg-primary/10 text-primary rounded-lg p-3 flex-shrink-0">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              Documents{' '}
              <span className="text-muted-foreground font-normal">
                ({localDocuments.length})
              </span>
            </h2>
          </div>
        </div>

        {displayRows.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-muted-foreground">No documents available</p>
          </div>
        ) : (
          <div className="space-y-3">
            {displayRows.map((doc) => (
              <div
                key={doc.id}
                className="border border-border rounded-lg p-4 bg-card hover:bg-muted/50 transition-colors"
              >
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <FileText className="w-5 h-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-foreground truncate">{doc.type}</p>
                      <p className="text-sm text-muted-foreground">
                        {doc.status === 'generated' && doc.generatedAt
                          ? `Generated ${formatDate(doc.generatedAt)} · PDF${
                              doc.sizeLabel ? ` · ${doc.sizeLabel}` : ''
                            }`
                          : 'Not generated yet'}
                      </p>
                    </div>
                  </div>

                  <div className="flex-shrink-0">
                    {doc.status === 'generated' ? (
                      <Button
                        onClick={() => handleDownload(doc.id)}
                        className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground"
                        size="sm"
                        disabled={downloadingId === doc.id}
                      >
                        <Download className="w-4 h-4" />
                        {downloadingId === doc.id ? 'Preparing…' : 'Download'}
                      </Button>
                    ) : doc.status === 'generating' ? (
                      <Button disabled size="sm" className="gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Generating…
                      </Button>
                    ) : canManage ? (
                      <Button onClick={handleGenerate} variant="outline" size="sm">
                        Generate
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}