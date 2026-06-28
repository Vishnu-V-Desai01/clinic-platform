// src/features/payments/components/new-charge-dialog-client.tsx

'use client';

import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ChevronsUpDown, Plus, X } from 'lucide-react';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader,
  DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command, CommandEmpty, CommandGroup, CommandInput,
  CommandItem, CommandList,
} from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { createManualCharge, createManualChargeAndApprove } from '../actions';
import type { PatientPickerItem } from '../types';

interface LineItemRow {
  key: string;
  description: string;
  quantity: string;
  unitPrice: string;
}

let _keyCounter = 0;
const newKey = () => String(++_keyCounter);

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patients: PatientPickerItem[];
}

function fmt(rupees: number): string {
  return (
    '₹' +
    rupees.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

export default function NewChargeDialog({ open, onOpenChange, patients }: Props) {
  const router = useRouter();

  const [patientId, setPatientId]   = useState('');
  const [comboOpen, setComboOpen]   = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [lineItems, setLineItems]   = useState<LineItemRow[]>([
    { key: newKey(), description: '', quantity: '1', unitPrice: '' },
  ]);
  const [note, setNote]             = useState('');
  const [loading, setLoading]       = useState<'create' | 'approve' | null>(null);
  const [error, setError]           = useState<string | null>(null);

  const reset = () => {
    setPatientId('');
    setLineItems([{ key: newKey(), description: '', quantity: '1', unitPrice: '' }]);
    setNote('');
    setError(null);
    setSearchTerm('');
  };

  const handleOpenChange = (v: boolean) => {
    onOpenChange(v);
    if (!v) reset();
  };

  const selectedPatient = useMemo(
    () => patients.find((p) => p.id === patientId),
    [patientId, patients]
  );

  const filteredPatients = useMemo(() => {
    if (!searchTerm.trim()) return patients;
    const t = searchTerm.toLowerCase();
    return patients.filter(
      (p) => p.name.toLowerCase().includes(t) || p.mrn.toLowerCase().includes(t)
    );
  }, [patients, searchTerm]);

  const validItems = useMemo(
    () =>
      lineItems.filter(
        (item) =>
          item.description.trim() &&
          (parseInt(item.quantity) || 0) > 0 &&
          parseFloat(item.unitPrice) >= 0 &&
          item.unitPrice !== ''
      ),
    [lineItems]
  );

  const total = useMemo(
    () =>
      validItems.reduce(
        (sum, item) =>
          sum + (parseInt(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0),
        0
      ),
    [validItems]
  );

  const isValid = patientId.length > 0 && validItems.length > 0;

  const update = (key: string, field: keyof Omit<LineItemRow, 'key'>, value: string) =>
    setLineItems((prev) =>
      prev.map((item) => (item.key === key ? { ...item, [field]: value } : item))
    );

  const remove = (key: string) => {
    if (lineItems.length === 1) return;
    setLineItems((prev) => prev.filter((item) => item.key !== key));
  };

  const add = () =>
    setLineItems((prev) => [
      ...prev,
      { key: newKey(), description: '', quantity: '1', unitPrice: '' },
    ]);

  const submit = async (mode: 'create' | 'approve') => {
    if (!isValid) return;
    setLoading(mode);
    setError(null);

    try {
      const action = mode === 'approve' ? createManualChargeAndApprove : createManualCharge;
      const result = await action({
        patient_id: patientId,
        line_items: validItems.map((item) => ({
          description: item.description.trim(),
          quantity:    parseInt(item.quantity),
          unit_price:  parseFloat(item.unitPrice),
        })),
        approval_notes: note.trim() || null,
      });

      if (!result.success) {
        setError(result.error || 'Failed to create charge');
        return;
      }

      handleOpenChange(false);
      router.refresh();
    } catch (err: any) {
      console.error('[NewChargeDialog]', err);
      setError(err?.message || 'An unexpected error occurred.');
    } finally {
      setLoading(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-full max-w-xl">
        <DialogHeader>
          <DialogTitle>New Charge</DialogTitle>
          <DialogDescription>
            Add one or more services. Use{' '}
            <span className="font-medium text-foreground">Instant Approve</span>{' '}
            for immediate counter collection.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Scrollable body */}
        <div className="space-y-5 max-h-[60vh] overflow-y-auto pr-1">

          {/* Patient picker */}
          <div className="space-y-2">
            <Label htmlFor="patient-picker">
              Patient <span className="text-destructive">*</span>
            </Label>
            <Popover open={comboOpen} onOpenChange={setComboOpen}>
              <PopoverTrigger asChild>
                <Button
                  id="patient-picker"
                  variant="outline"
                  className={cn('w-full justify-between', !patientId && 'text-muted-foreground')}
                >
                  {selectedPatient
                    ? selectedPatient.name + ' · ' + selectedPatient.mrn
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
                          ? 'No active patients found.'
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
                              setComboOpen(false);
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
          </div>

          {/* Line items */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>
                Services / Items <span className="text-destructive">*</span>
              </Label>
              <span className="text-xs text-muted-foreground">
                {lineItems.length} item{lineItems.length !== 1 ? 's' : ''}
              </span>
            </div>

            <div className="space-y-3">
              {lineItems.map((item, idx) => {
                const qty      = parseInt(item.quantity) || 0;
                const price    = parseFloat(item.unitPrice) || 0;
                const rowTotal = qty * price;

                return (
                  <div
                    key={item.key}
                    className="rounded-lg border border-border bg-muted/30 p-4 space-y-3"
                  >
                    {/* Description row */}
                    <div className="flex items-start gap-2">
                      <div className="flex-1 space-y-1.5">
                        <Label className="text-xs text-muted-foreground">
                          Description
                        </Label>
                        <Input
                          placeholder={
                            idx === 0
                              ? 'e.g. Consultation fee'
                              : 'e.g. Blood test, X-Ray, Medication…'
                          }
                          value={item.description}
                          onChange={(e) =>
                            update(item.key, 'description', e.target.value)
                          }
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => remove(item.key)}
                        disabled={lineItems.length === 1}
                        className="mt-5 h-8 w-8 flex-shrink-0 text-muted-foreground hover:text-destructive disabled:opacity-25"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>

                    {/* Qty / Price / Total */}
                    <div className="grid grid-cols-[96px_1fr_auto] gap-3 items-end">
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Qty</Label>
                        <Input
                          type="number"
                          min="1"
                          step="1"
                          value={item.quantity}
                          onChange={(e) =>
                            update(item.key, 'quantity', e.target.value)
                          }
                          className="text-center"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">
                          Unit Price
                        </Label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm pointer-events-none">
                            ₹
                          </span>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="0.00"
                            value={item.unitPrice}
                            onChange={(e) =>
                              update(item.key, 'unitPrice', e.target.value)
                            }
                            className="pl-7"
                          />
                        </div>
                      </div>

                      <div className="space-y-1.5 text-right min-w-[80px]">
                        <p className="text-xs text-muted-foreground">Subtotal</p>
                        <p className="h-10 flex items-center justify-end text-base font-semibold text-foreground tabular-nums">
                          {rowTotal > 0 ? fmt(rowTotal) : '—'}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Add service + running total */}
            <div className="flex items-center justify-between pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={add}
                className="border-primary/30 text-primary hover:bg-primary/5"
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Add Service
              </Button>

              {total > 0 && (
                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground">
                    {lineItems.length > 1 ? 'Grand Total' : 'Total'}
                  </span>
                  <span className="text-2xl font-bold text-foreground tabular-nums">
                    {fmt(total)}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Notes */}
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
              rows={2}
              className="resize-none"
            />
          </div>

        </div>{/* end scrollable body */}

        <DialogFooter className="gap-2 flex-col sm:flex-row mt-2 pt-4 border-t border-border">
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={loading !== null}
            className="sm:mr-auto"
          >
            Cancel
          </Button>
          <Button
            variant="outline"
            onClick={() => submit('create')}
            disabled={!isValid || loading !== null}
          >
            {loading === 'create' ? 'Creating...' : 'Create Charge'}
          </Button>
          <Button
            onClick={() => submit('approve')}
            disabled={!isValid || loading !== null}
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            {loading === 'approve' ? 'Approving...' : 'Instant Approve'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}