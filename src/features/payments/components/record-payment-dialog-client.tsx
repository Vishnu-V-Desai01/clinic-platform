// src/features/payments/components/record-payment-dialog-client.tsx

'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ChevronsUpDown } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { recordPaymentCollection } from '../actions';
import type { ApprovedChargeView } from '../types';

interface RecordPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  approvedCharges: ApprovedChargeView[];
  defaultChargeId?: string | null;
}

function formatINR(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function getTodayDateString(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function RecordPaymentDialog({
  open,
  onOpenChange,
  approvedCharges,
  defaultChargeId = null,
}: RecordPaymentDialogProps) {
  const router = useRouter();
  const [chargeId, setChargeId] = useState<string>('');
  const [amountReceivedRupees, setAmountReceivedRupees] = useState<string>('');
  const [mode, setMode] = useState<string>('');
  const [date, setDate] = useState<string>(getTodayDateString());
  const [reference, setReference] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [isComboboxOpen, setIsComboboxOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (open && defaultChargeId) {
      setChargeId(defaultChargeId);
    }
  }, [open, defaultChargeId]);

  const resetForm = () => {
    setChargeId('');
    setAmountReceivedRupees('');
    setMode('');
    setDate(getTodayDateString());
    setReference('');
    setNotes('');
    setErrorMessage(null);
    setSearchTerm('');
  };

  const handleOpenChange = (newOpen: boolean) => {
    onOpenChange(newOpen);
    if (!newOpen) resetForm();
  };

  const selectedCharge = useMemo(
    () => approvedCharges.find((c) => c.id === chargeId),
    [chargeId, approvedCharges]
  );

  useEffect(() => {
    if (selectedCharge) {
      setAmountReceivedRupees((selectedCharge.amountDuePaise / 100).toFixed(2));
    }
  }, [selectedCharge]);

  const filteredCharges = useMemo(() => {
    if (!searchTerm.trim()) return approvedCharges;
    const term = searchTerm.toLowerCase();
    return approvedCharges.filter(
      (c) =>
        c.patientName.toLowerCase().includes(term) ||
        c.patientMrn.toLowerCase().includes(term) ||
        c.service.toLowerCase().includes(term)
    );
  }, [approvedCharges, searchTerm]);

  const isValid = chargeId && amountReceivedRupees && mode && date;

  const handleSubmit = async () => {
    if (!isValid || !selectedCharge) return;

    const amountReceivedPaise = Math.round(parseFloat(amountReceivedRupees) * 100);

    if (amountReceivedPaise > selectedCharge.amountDuePaise) {
      setErrorMessage(
        `Amount exceeds outstanding balance of ${formatINR(selectedCharge.amountDuePaise)}`
      );
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const result = await recordPaymentCollection({
        payment_id: chargeId,
        amount_collected: amountReceivedPaise / 100,
        collection_date: new Date(date),
        payment_method: mode as
          | 'cash'
          | 'card'
          | 'upi'
          | 'bank_transfer'
          | 'check'
          | 'other',
        transaction_reference: reference.trim() || null,
        notes: notes.trim() || null,
      });

      if (!result.success) {
        setErrorMessage(result.error || 'Failed to record payment');
        return;
      }

      handleOpenChange(false);
      router.refresh();
    } catch (err: any) {
      console.error('[RecordPaymentDialog] submit error:', err);
      setErrorMessage(err?.message || 'An unexpected error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-full max-w-lg">
        <DialogHeader>
          <DialogTitle>Record Payment</DialogTitle>
          <DialogDescription>
            Collect a payment against an approved charge
          </DialogDescription>
        </DialogHeader>

        {errorMessage && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {errorMessage}
          </div>
        )}

        <div className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="charge-combobox">
              Charge <span className="text-destructive">*</span>
            </Label>
            <Popover open={isComboboxOpen} onOpenChange={setIsComboboxOpen}>
              <PopoverTrigger asChild>
                <Button
                  id="charge-combobox"
                  variant="outline"
                  className={cn(
                    'w-full justify-between',
                    !chargeId && 'text-muted-foreground'
                  )}
                >
                  {selectedCharge ? (
                    <span className="truncate">
                      {selectedCharge.patientName} · {selectedCharge.service} ·
                      Due {formatINR(selectedCharge.amountDuePaise)}
                    </span>
                  ) : (
                    'Select a charge...'
                  )}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0" align="start">
                <Command shouldFilter={false}>
                  <CommandInput
                    placeholder="Search by patient name or MRN..."
                    value={searchTerm}
                    onValueChange={setSearchTerm}
                  />
                  <CommandList>
                    {filteredCharges.length === 0 ? (
                      <CommandEmpty>No charges found.</CommandEmpty>
                    ) : (
                      <CommandGroup>
                        {filteredCharges.map((c) => (
                          <CommandItem
                            key={c.id}
                            value={c.id}
                            onSelect={() => {
                              setChargeId(c.id);
                              setIsComboboxOpen(false);
                              setSearchTerm('');
                            }}
                          >
                            <Check
                              className={cn(
                                'mr-2 h-4 w-4',
                                chargeId === c.id ? 'opacity-100' : 'opacity-0'
                              )}
                            />
                            <span className="truncate">
                              {c.patientName} · {c.service} · Due{' '}
                              {formatINR(c.amountDuePaise)}
                            </span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    )}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>

            {selectedCharge && (
              <div className="rounded bg-muted px-3 py-2 text-sm text-muted-foreground">
                Amount due: {formatINR(selectedCharge.amountDuePaise)}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="amount-received">
              Amount Received <span className="text-destructive">*</span>
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground">
                ₹
              </span>
              <Input
                id="amount-received"
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={amountReceivedRupees}
                onChange={(e) => setAmountReceivedRupees(e.target.value)}
                className="pl-7"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="payment-mode">
              Payment Mode <span className="text-destructive">*</span>
            </Label>
            <Select value={mode} onValueChange={setMode}>
              <SelectTrigger id="payment-mode">
                <SelectValue placeholder="Select payment mode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="card">Card</SelectItem>
                <SelectItem value="upi">UPI</SelectItem>
                <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                <SelectItem value="check">Cheque</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="payment-date">
                Payment Date <span className="text-destructive">*</span>
              </Label>
              <Input
                id="payment-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reference-no">Reference / UTR No.</Label>
              <Input
                id="reference-no"
                type="text"
                placeholder="UPI txn id / UTR"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              placeholder="Add any additional notes..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="resize-none"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!isValid || isLoading}>
            {isLoading ? 'Recording...' : 'Record Payment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}