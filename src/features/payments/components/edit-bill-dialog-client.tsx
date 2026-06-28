// src/features/payments/components/edit-bill-dialog-client.tsx

'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, X, Pencil } from 'lucide-react';
import {
  Dialog, DialogContent, DialogFooter,
  DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  addPaymentLineItem,
  updatePaymentLineItem,
  removePaymentLineItem,
} from '../actions';
import type { PaymentLineItem } from '../types';

interface EditableItem {
  id: string | null;
  key: string;
  description: string;
  quantity: string;
  unitPrice: string;
  isRemoved: boolean;
}

interface Props {
  paymentId: string;
  initialLineItems: PaymentLineItem[];
  amountPaid: number;
}

let _k = 0;
const nk = () => 'new-' + ++_k;

function fmt(v: number) {
  return (
    '₹' +
    Number(v).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

export default function EditBillDialog({
  paymentId,
  initialLineItems,
  amountPaid,
}: Props) {
  const router = useRouter();
  const [open, setOpen]         = useState(false);
  const [items, setItems]       = useState<EditableItem[]>([]);
  const [isLoading, setLoading] = useState(false);
  const [error, setError]       = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setItems(
      initialLineItems.length > 0
        ? initialLineItems.map((item) => ({
            id: item.id,
            key: item.id,
            description: item.description,
            quantity: String(item.quantity),
            unitPrice: String(item.unit_price),
            isRemoved: false,
          }))
        : [{ id: null, key: nk(), description: '', quantity: '1', unitPrice: '', isRemoved: false }]
    );
    setError(null);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeItems = useMemo(() => items.filter((i) => !i.isRemoved), [items]);

  const total = useMemo(
    () =>
      activeItems.reduce(
        (sum, item) =>
          sum +
          (parseInt(item.quantity) || 0) *
          (parseFloat(item.unitPrice) || 0),
        0
      ),
    [activeItems]
  );

  const validActiveCount = useMemo(
    () =>
      activeItems.filter(
        (i) =>
          i.description.trim() &&
          (parseInt(i.quantity) || 0) > 0 &&
          (parseFloat(i.unitPrice) || 0) >= 0
      ).length,
    [activeItems]
  );

  const canSave = validActiveCount > 0 && total >= amountPaid;

  const update = (
    key: string,
    field: 'description' | 'quantity' | 'unitPrice',
    value: string
  ) =>
    setItems((prev) =>
      prev.map((item) => (item.key === key ? { ...item, [field]: value } : item))
    );

  const remove = (key: string) => {
    setItems((prev) => {
      const item = prev.find((i) => i.key === key);
      if (!item) return prev;
      if (!item.id) return prev.filter((i) => i.key !== key);
      return prev.map((i) => (i.key === key ? { ...i, isRemoved: true } : i));
    });
  };

  const add = () =>
    setItems((prev) => [
      ...prev,
      { id: null, key: nk(), description: '', quantity: '1', unitPrice: '', isRemoved: false },
    ]);

  const handleSave = async () => {
    if (!canSave) return;
    setLoading(true);
    setError(null);

    try {
      // 1. Remove deleted existing items
      for (const item of items.filter((i) => i.id && i.isRemoved)) {
        const result = await removePaymentLineItem({ id: item.id!, payment_id: paymentId });
        if (!result.success) throw new Error(result.error || 'Failed to remove item');
      }

      // 2. Update modified existing items
      for (const item of items.filter((i) => i.id && !i.isRemoved)) {
        const orig = initialLineItems.find((o) => o.id === item.id);
        const changed =
          orig &&
          (item.description.trim() !== orig.description ||
            parseInt(item.quantity) !== orig.quantity ||
            parseFloat(item.unitPrice) !== orig.unit_price);
        if (changed) {
          const result = await updatePaymentLineItem({
            id: item.id!,
            payment_id: paymentId,
            description: item.description.trim(),
            quantity: parseInt(item.quantity),
            unit_price: parseFloat(item.unitPrice),
          });
          if (!result.success) throw new Error(result.error || 'Failed to update item');
        }
      }

      // 3. Insert new items
      const newItems = items.filter((i) => !i.id && !i.isRemoved && i.description.trim());
      for (let idx = 0; idx < newItems.length; idx++) {
        const item = newItems[idx];
        const result = await addPaymentLineItem({
          payment_id: paymentId,
          description: item.description.trim(),
          quantity: parseInt(item.quantity),
          unit_price: parseFloat(item.unitPrice),
          sort_order: initialLineItems.length + idx,
        });
        if (!result.success) throw new Error(result.error || 'Failed to add item');
      }

      setOpen(false);
      router.refresh();
    } catch (err: any) {
      console.error('[EditBillDialog]', err);
      setError(err?.message || 'Failed to save changes');
    } finally {
      setLoading(false);
    }
  };

  const removedCount = items.filter((i) => i.isRemoved && i.id).length;
  const newCount     = items.filter((i) => !i.id && !i.isRemoved).length;

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="gap-2"
      >
        <Pencil className="h-3.5 w-3.5" />
        Edit Bill
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-full max-w-xl">
          <DialogHeader>
            <DialogTitle>Edit Bill</DialogTitle>
            <DialogDescription>
              Add, edit, or remove services on this charge.
              {amountPaid > 0 && (
                <span className="block mt-1 text-amber-600 dark:text-amber-400">
                  {fmt(amountPaid)} already collected — total cannot go below this.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Scrollable body */}
          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">

            {/* Item cards */}
            <div className="space-y-3">
              {activeItems.map((item) => {
                const qty      = parseInt(item.quantity) || 0;
                const price    = parseFloat(item.unitPrice) || 0;
                const rowTotal = qty * price;
                const isNew    = !item.id;

                return (
                  <div
                    key={item.key}
                    className={
                      'rounded-lg border p-4 space-y-3 ' +
                      (isNew
                        ? 'border-primary/30 bg-primary/5'
                        : 'border-border bg-muted/30')
                    }
                  >
                    {isNew && (
                      <p className="text-xs font-medium text-primary">New item</p>
                    )}

                    {/* Description row */}
                    <div className="flex items-start gap-2">
                      <div className="flex-1 space-y-1.5">
                        <Label className="text-xs text-muted-foreground">
                          Description
                        </Label>
                        <Input
                          placeholder="e.g. Consultation, Lab test, X-Ray…"
                          value={item.description}
                          onChange={(e) =>
                            update(item.key, 'description', e.target.value)
                          }
                          disabled={isLoading}
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => remove(item.key)}
                        disabled={isLoading}
                        className="mt-5 h-8 w-8 flex-shrink-0 text-muted-foreground hover:text-destructive"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>

                    {/* Qty / Price / Subtotal */}
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
                          disabled={isLoading}
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
                            disabled={isLoading}
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

              {activeItems.length === 0 && (
                <div className="rounded-lg border border-dashed border-border p-6 text-center">
                  <p className="text-sm text-muted-foreground">
                    No items remaining. Add at least one item before saving.
                  </p>
                </div>
              )}
            </div>

            {/* Add item + running total */}
            <div className="flex items-center justify-between pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={add}
                disabled={isLoading}
                className="border-primary/30 text-primary hover:bg-primary/5"
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Add Service
              </Button>

              {total > 0 && (
                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground">
                    {activeItems.length > 1 ? 'Grand Total' : 'Total'}
                  </span>
                  <span
                    className={
                      'text-2xl font-bold tabular-nums ' +
                      (total < amountPaid
                        ? 'text-destructive'
                        : 'text-foreground')
                    }
                  >
                    {fmt(total)}
                  </span>
                </div>
              )}
            </div>

            {total > 0 && total < amountPaid && (
              <p className="text-xs text-destructive">
                Total must be at least {fmt(amountPaid)} (already collected).
              </p>
            )}

            {(removedCount > 0 || newCount > 0) && (
              <div className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground flex gap-4">
                {removedCount > 0 && (
                  <span>
                    {removedCount} item{removedCount !== 1 ? 's' : ''} will be removed
                  </span>
                )}
                {newCount > 0 && (
                  <span>
                    {newCount} new item{newCount !== 1 ? 's' : ''} will be added
                  </span>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 flex-col sm:flex-row mt-2 pt-4 border-t border-border">
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isLoading}
              className="sm:mr-auto"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={!canSave || isLoading}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              {isLoading ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}