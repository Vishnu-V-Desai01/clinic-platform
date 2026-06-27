// src/features/payments/components/charge-approvals-client.tsx

'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Plus } from 'lucide-react';
import { setAmountAndApprovePayment, approvePayment } from '../actions';
import NewChargeDialog from './new-charge-dialog-client';
import type { PendingChargeView, PatientPickerItem } from '../types';

function formatINR(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function getInitials(name: string): string {
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
}

function getAvatarColor(name: string): string {
  const colors = [
    'bg-blue-500/10 text-blue-700 dark:text-blue-400',
    'bg-rose-500/10 text-rose-700 dark:text-rose-400',
    'bg-green-500/10 text-green-700 dark:text-green-400',
    'bg-purple-500/10 text-purple-700 dark:text-purple-400',
    'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  ];
  const hash = name.charCodeAt(0) + name.charCodeAt(Math.floor(name.length / 2));
  return colors[hash % colors.length];
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

interface ChargeApprovalsClientProps {
  charges: PendingChargeView[];
  patients: PatientPickerItem[];
  userRole: 'doctor' | 'staff' | 'patient';
}

export default function ChargeApprovalsClient({
  charges,
  patients,
  userRole,
}: ChargeApprovalsClientProps) {
  const router = useRouter();
  const [localCharges, setLocalCharges] = useState(charges);
  const [selectedCharge, setSelectedCharge] = useState<PendingChargeView | null>(null);
  const [approvalAmount, setApprovalAmount] = useState<string>('');
  const [approvalNote, setApprovalNote] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [newChargeOpen, setNewChargeOpen] = useState(false);

  if (userRole !== 'doctor' && userRole !== 'staff') {
    return (
      <div className="flex items-center justify-center min-h-[60vh] bg-background px-4">
        <div className="text-center">
          <p className="text-lg font-medium text-foreground">Access restricted</p>
          <p className="text-sm text-muted-foreground mt-2">
            This page is available to clinic staff and doctors only.
          </p>
        </div>
      </div>
    );
  }

  const totalProposedPaise = localCharges.reduce(
    (sum, c) => sum + c.proposedAmountPaise,
    0
  );

  const handleApproveClick = (charge: PendingChargeView) => {
    setErrorMessage(null);
    setSelectedCharge(charge);
    setApprovalAmount(
      charge.proposedAmountPaise > 0
        ? (charge.proposedAmountPaise / 100).toFixed(2)
        : ''
    );
    setApprovalNote('');
  };

  const handleConfirmApprove = async () => {
    if (!selectedCharge) return;

    const amountRupees = parseFloat(approvalAmount);
    if (isNaN(amountRupees) || amountRupees <= 0) {
      setErrorMessage('Please enter a valid amount');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const result = await setAmountAndApprovePayment({
        payment_id: selectedCharge.id,
        amount_charged: amountRupees,
        approval_notes: approvalNote.trim() || null,
      });

      if (!result.success) {
        setErrorMessage(result.error || 'Failed to approve charge');
        return;
      }

      setLocalCharges((prev) => prev.filter((c) => c.id !== selectedCharge.id));
      setSelectedCharge(null);
      setApprovalAmount('');
      setApprovalNote('');
      router.refresh();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Unexpected error approving charge');
    } finally {
      setIsLoading(false);
    }
  };

  const handleReject = async (chargeId: string) => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const result = await approvePayment({
        payment_id: chargeId,
        approval_status: 'rejected',
        approval_notes: null,
      });

      if (!result.success) {
        setErrorMessage(result.error || 'Failed to reject charge');
        return;
      }

      setLocalCharges((prev) => prev.filter((c) => c.id !== chargeId));
      router.refresh();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Unexpected error rejecting charge');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8 flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold text-foreground">
              Charge Approvals
            </h1>
            <p className="text-muted-foreground mt-1">
              Review and approve charges before collection
            </p>
            {localCharges.length > 0 && (
              <p className="text-sm text-muted-foreground mt-3">
                {localCharges.length} charge{localCharges.length !== 1 ? 's' : ''} awaiting approval
                {totalProposedPaise > 0 && ` · ${formatINR(totalProposedPaise)} proposed`}
              </p>
            )}
          </div>
          <Button
            onClick={() => setNewChargeOpen(true)}
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Charge
          </Button>
        </div>

        {errorMessage && (
          <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {errorMessage}
          </div>
        )}

        {localCharges.length === 0 ? (
          <Card className="p-8 text-center border-border rounded-xl shadow-sm bg-card">
            <p className="text-muted-foreground">No charges awaiting approval</p>
          </Card>
        ) : (
          <div className="space-y-4">
            {localCharges.map((charge) => {
              const avatarColor = getAvatarColor(charge.patientName);
              return (
                <Card
                  key={charge.id}
                  className="border-border rounded-xl shadow-sm p-5 flex flex-col md:flex-row md:items-center gap-4 bg-card hover:shadow-md transition-shadow"
                >
                  <div className="flex-shrink-0 flex gap-3 items-start md:items-center min-w-0">
                    <Avatar className={`h-10 w-10 flex-shrink-0 ${avatarColor}`}>
                      <AvatarFallback>{getInitials(charge.patientName)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="font-medium text-foreground truncate">
                        {charge.patientName}
                      </p>
                      <p className="text-xs text-muted-foreground">{charge.patientMrn}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {charge.service} · {formatDate(charge.date)}
                      </p>
                    </div>
                  </div>

                  <div className="flex-1 md:flex-none flex items-center gap-3">
                    <div className="flex-1 md:flex-none">
                      <p className="font-medium text-foreground text-lg">
                        {charge.proposedAmountPaise > 0
                          ? formatINR(charge.proposedAmountPaise)
                          : 'Fee not set'}
                      </p>
                      <Badge className="mt-1 bg-amber-500/15 text-amber-700 dark:text-amber-400 hover:bg-amber-500/15 border-0">
                        Pending Approval
                      </Badge>
                    </div>
                  </div>

                  <div className="flex gap-2 flex-shrink-0">
                    <Button
                      onClick={() => handleApproveClick(charge)}
                      disabled={isLoading}
                      className="bg-primary hover:bg-primary/90 text-primary-foreground"
                      size="sm"
                    >
                      Set & Approve
                    </Button>
                    <Button
                      onClick={() => handleReject(charge.id)}
                      disabled={isLoading}
                      variant="outline"
                      size="sm"
                      className="border-destructive/40 text-destructive hover:bg-destructive/10"
                    >
                      Reject
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <Dialog
        open={!!selectedCharge}
        onOpenChange={(open) => !open && setSelectedCharge(null)}
      >
        <DialogContent className="max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle>Approve Charge</DialogTitle>
          </DialogHeader>

          {selectedCharge && (
            <div className="space-y-4">
              <div className="space-y-2 p-3 bg-muted rounded-lg">
                <div>
                  <span className="text-xs font-medium text-muted-foreground">Patient:</span>
                  <p className="text-sm text-foreground">{selectedCharge.patientName}</p>
                </div>
                <div>
                  <span className="text-xs font-medium text-muted-foreground">Service:</span>
                  <p className="text-sm text-foreground">{selectedCharge.service}</p>
                </div>
                <div>
                  <span className="text-xs font-medium text-muted-foreground">Date:</span>
                  <p className="text-sm text-foreground">{formatDate(selectedCharge.date)}</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="approve-amount">Amount (₹)</Label>
                <Input
                  id="approve-amount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={approvalAmount}
                  onChange={(e) => setApprovalAmount(e.target.value)}
                  placeholder="0.00"
                  disabled={isLoading}
                  className="border-border bg-background text-foreground"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="approve-note">
                  Note <span className="text-xs text-muted-foreground">(optional)</span>
                </Label>
                <Textarea
                  id="approve-note"
                  value={approvalNote}
                  onChange={(e) => setApprovalNote(e.target.value)}
                  placeholder="Add any notes..."
                  disabled={isLoading}
                  rows={3}
                  className="border-border bg-background text-foreground resize-none"
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              onClick={() => setSelectedCharge(null)}
              variant="outline"
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmApprove}
              disabled={isLoading}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              {isLoading ? 'Approving...' : 'Approve Charge'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <NewChargeDialog
        open={newChargeOpen}
        onOpenChange={setNewChargeOpen}
        patients={patients}
      />
    </div>
  );
}