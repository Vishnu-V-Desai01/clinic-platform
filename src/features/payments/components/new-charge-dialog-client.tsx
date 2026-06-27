// src/features/payments/components/new-charge-dialog-client.tsx

'use client';

import React, { useState, useMemo } from 'react';
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
import { createManualCharge, createManualChargeAndApprove } from '../actions';
import type { PatientPickerItem } from '../types';

interface NewChargeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patients: PatientPickerItem[];
}

export default function NewChargeDialog({
  open,
  onOpenChange,
  patients,
}: NewChargeDialogProps) {
  const router = useRouter();
  const [patientId, setPatientId] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [isComboboxOpen, setIsComboboxOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [loadingAction, setLoadingAction] = useState<'create' | 'approve' | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const resetForm = () => {
    setPatientId('');
    setDescription('');
    setAmount('');
    setNote('');
    setErrorMessage(null);
    setSearchTerm('');
  };

  const handleOpenChange = (newOpen: boolean) => {
    onOpenChange(newOpen);
    if (!newOpen) resetForm();
  };

  const selectedPatient = useMemo(
    () => patients.find((p) => p.id === patientId),
    [patientId, patients]
  );

  const filteredPatients = useMemo(() => {
    if (!searchTerm.trim()) return patients;
    const term = searchTerm.toLowerCase();
    return patients.filter(
      (p) =>
        p.name.toLowerCase().includes(term) ||
        p.mrn.toLowerCase().includes(term)
    );
  }, [patients, searchTerm]);

  const isValid = patientId && description.trim() && amount;

  const submit = async (mode: 'create' | 'approve') => {
    if (!isValid) return;

    const amountRupees = parseFloat(amount);
    if (isNaN(amountRupees) || amountRupees <= 0) {
      setErrorMessage('Please enter a valid amount');
      return;
    }

    setLoadingAction(mode);
    setErrorMessage(null);

    try {
      const action =
        mode === 'approve' ? createManualChargeAndApprove : createManualCharge;

      const result = await action({
        patient_id: patientId,
        description: description.trim(),
        amount_charged: amountRupees,
        approval_notes: note.trim() || null,
      });

      if (!result.success) {
        setErrorMessage(result.error || 'Failed to create charge');
        return;
      }

      handleOpenChange(false);
      router.refresh();
    } catch (err: any) {
      console.error('[NewChargeDialog] submit error:', err);
      setErrorMessage(
        err?.message || 'An unexpected error occurred. Check the browser console.'
      );
    } finally {
      setLoadingAction(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-full max-w-lg">
        <DialogHeader>
          <DialogTitle>New Charge</DialogTitle>
          <DialogDescription>
            Create a charge for a walk-in visit or ad-hoc service. Use{' '}
            <span className="font-medium text-foreground">Instant Approve</span>{' '}
            for fast counter collection.
          </DialogDescription>
        </DialogHeader>

        {errorMessage && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {errorMessage}
          </div>
        )}

        <div className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="patient-combobox">
              Patient <span className="text-destructive">*</span>
            </Label>
            <Popover open={isComboboxOpen} onOpenChange={setIsComboboxOpen}>
              <PopoverTrigger asChild>
                <Button
                  id="patient-combobox"
                  variant="outline"
                  className={cn(
                    'w-full justify-between',
                    !patientId && 'text-muted-foreground'
                  )}
                >
                  {selectedPatient
                    ? `${selectedPatient.name} · ${selectedPatient.mrn}`
                    : 'Select a patient...'}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0" align="start">
                <Command shouldFilter={false}>
                  <CommandInput
                    placeholder="Search by name or MRN..."
                    value={searchTerm}
                    onValueChange={setSearchTerm}
                  />
                  <CommandList>
                    {filteredPatients.length === 0 ? (
                      <CommandEmpty>
                        {patients.length === 0
                          ? 'No active patients found in the system.'
                          : 'No patients match your search.'}
                      </CommandEmpty>
                    ) : (
                      <CommandGroup>
                        {filteredPatients.map((p) => (
                          <CommandItem
                            key={p.id}
                            value={p.id}
                            onSelect={() => {
                              setPatientId(p.id);
                              setIsComboboxOpen(false);
                              setSearchTerm('');
                            }}
                          >
                            <Check
                              className={cn(
                                'mr-2 h-4 w-4',
                                patientId === p.id ? 'opacity-100' : 'opacity-0'
                              )}
                            />
                            <span className="truncate">
                              {p.name}{' '}
                              <span className="text-muted-foreground text-xs">
                                · {p.mrn}
                              </span>
                            </span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    )}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {patients.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No active patients found. Register a patient first.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="charge-description">
              Description <span className="text-destructive">*</span>
            </Label>
            <Input
              id="charge-description"
              type="text"
              placeholder="e.g. Walk-in consultation, Blood test, X-Ray"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="charge-amount">
              Amount (₹) <span className="text-destructive">*</span>
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground">
                ₹
              </span>
              <Input
                id="charge-amount"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="pl-7"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="charge-note">
              Note{' '}
              <span className="text-xs text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="charge-note"
              placeholder="Add any notes..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className="resize-none"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2 flex-col sm:flex-row">
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={loadingAction !== null}
            className="sm:mr-auto"
          >
            Cancel
          </Button>
          <Button
            variant="outline"
            onClick={() => submit('create')}
            disabled={!isValid || loadingAction !== null}
          >
            {loadingAction === 'create' ? 'Creating...' : 'Create Charge'}
          </Button>
          <Button
            onClick={() => submit('approve')}
            disabled={!isValid || loadingAction !== null}
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            {loadingAction === 'approve' ? 'Approving...' : 'Instant Approve'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}