// src/features/post-visit/components/ChargesCard.tsx
//
// Card 4 of 5. Always controlled.
//
// Issue 5 additions:
//   - locked?: true when payment has already been collected on this visit
//     (financial-integrity rule) — renders read-only, no add/remove/edit,
//     with a banner explaining why and pointing to the Payments screen.
//   - requiresApproval?: true when the caller is staff (not the treating
//     doctor or an admin) — shows an informational banner above the
//     editable form; the charges themselves stay fully editable, they just
//     won't be auto-approved on save.
//
// unitPrice in RUPEES (not paise) — matches payment_line_items.unit_price.

'use client'

import { Plus, X, Lock, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { ChargeLineItem } from '../types'

interface ChargesCardProps {
  value:             ChargeLineItem[]
  onChange:          (items: ChargeLineItem[]) => void
  locked?:           boolean
  requiresApproval?: boolean
}

// Rupees formatter — unitPrice is stored as rupees, not paise.
const fmt = (rupees: number) =>
  `₹${rupees.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`

export default function ChargesCard({ value, onChange, locked, requiresApproval }: ChargesCardProps) {
  const handleAdd = () => {
    const newItem: ChargeLineItem = {
      localId:     crypto.randomUUID(),
      description: '',
      quantity:    1,
      unitPrice:   0,
    }
    onChange([...value, newItem])
  }

  const handleRemove = (localId: string) =>
    onChange(value.filter((item) => item.localId !== localId))

  const handleChange = (
    localId: string,
    patch: Partial<Omit<ChargeLineItem, 'localId'>>,
  ) =>
    onChange(
      value.map((item) =>
        item.localId === localId ? { ...item, ...patch } : item,
      ),
    )

  const total = value.reduce(
    (sum, item) => sum + item.quantity * item.unitPrice,
    0,
  )

  const headerSubtitle = locked
    ? 'Locked — payment has already been collected on this visit'
    : requiresApproval
      ? 'Will be submitted for approval by the treating doctor or an admin'
      : 'Auto-approved and linked to this appointment on save'

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-foreground">Charges</h2>
        <p className="text-sm text-muted-foreground">{headerSubtitle}</p>
      </div>

      {locked && (
        <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-4">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Payment has already been collected on this visit, so charges cannot be edited here.
            Use the Payments screen to record any correction as a separate transaction.
          </p>
        </div>
      )}

      {!locked && requiresApproval && (
        <div className="flex items-start gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <p className="text-sm text-muted-foreground">
            These charges will be submitted for approval by the treating doctor or an admin
            before they&apos;re finalized.
          </p>
        </div>
      )}

      {value.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-10">
          <p className="text-sm text-muted-foreground">No charges added.</p>
          {!locked && (
            <Button
              variant="ghost"
              size="sm"
              className="text-primary hover:text-primary/90"
              onClick={handleAdd}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add item
            </Button>
          )}
        </div>
      ) : (
        <>
          {/* Column headers */}
          <div className="flex items-center gap-2 px-1">
            <span className="flex-1 text-xs text-muted-foreground">Description</span>
            <span className="w-16 text-center text-xs text-muted-foreground">Qty</span>
            <span className="w-32 text-right text-xs text-muted-foreground">Amount (₹)</span>
            {!locked && <span className="w-9" />}
          </div>

          {/* Line items */}
          <div className="flex flex-col gap-2">
            {value.map((item) =>
              locked ? (
                <div
                  key={item.localId}
                  className="flex items-center gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2"
                >
                  <span className="flex-1 truncate text-sm text-foreground">
                    {item.description || '—'}
                  </span>
                  <span className="w-16 text-center text-sm text-muted-foreground">
                    {item.quantity}
                  </span>
                  <span className="w-32 text-right text-sm font-medium text-foreground">
                    {fmt(item.unitPrice)}
                  </span>
                </div>
              ) : (
                <div key={item.localId} className="flex items-center gap-2">
                  <Input
                    placeholder="Description"
                    value={item.description}
                    onChange={(e) =>
                      handleChange(item.localId, { description: e.target.value })
                    }
                    className="flex-1"
                  />

                  <Input
                    type="number"
                    min={1}
                    step={1}
                    value={item.quantity}
                    onChange={(e) =>
                      handleChange(item.localId, {
                        quantity: Math.max(1, parseInt(e.target.value, 10) || 1),
                      })
                    }
                    className="w-16 text-center"
                  />

                  <div className="relative w-32">
                    <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-foreground">
                      ₹
                    </span>
                    <Input
                      type="number"
                      min={0}
                      step={0.01}
                      placeholder="0.00"
                      value={item.unitPrice || ''}
                      onChange={(e) =>
                        handleChange(item.localId, {
                          unitPrice: parseFloat(e.target.value) || 0,
                        })
                      }
                      className="w-32 pl-6 text-right"
                    />
                  </div>

                  <Button
                    variant="ghost"
                    size="icon"
                    className="w-9 shrink-0 text-muted-foreground hover:text-foreground"
                    onClick={() => handleRemove(item.localId)}
                    aria-label="Remove item"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ),
            )}
          </div>

          {!locked && (
            <Button
              variant="ghost"
              size="sm"
              className="w-fit text-primary hover:text-primary/90"
              onClick={handleAdd}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add item
            </Button>
          )}

          {/* Total */}
          <div className="flex items-center justify-between border-t border-border pt-4">
            <span className="text-sm text-muted-foreground">Total</span>
            <span className="text-base font-semibold text-foreground">{fmt(total)}</span>
          </div>
        </>
      )}
    </div>
  )
}