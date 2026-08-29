// src/features/pharmacy/components/encounter-bill-drawer.tsx
//
// Chat C — encounter-grouped dispense + bill + payment collection.
//
// Substitute-medicine picker: for lines the queue couldn't match to the
// catalogue (free-text prescriptions, or a name that doesn't exactly match
// any drug), the pharmacist can search the clinic's real catalogue and
// substitute a stocked drug for that line, turning it billable. This does
// NOT change prescriptions.medicine_name or drug_id — it only affects what
// gets dispensed and billed for THIS encounter; the original prescription
// record is untouched.
//
// Reject-a-line: a separate, immediate action per line (not part of the
// batch dispense/bill submit). Calls rejectPrescription with a required
// reason via pharmacy_reject_prescription() — a SECURITY DEFINER RPC,
// since prescriptions_update RLS requires role='doctor' and a staff-role
// pharmacist cannot update that table directly. On success the line is
// removed from this drawer's local list; the parent's next queue refetch
// will correctly exclude it going forward (pharmacy_rejected_at IS NULL
// filter in getPharmacyQueue).
//
// todayIso is passed down from the server (via pharmacy-dashboard-client)
// rather than computed from the browser clock — substituted lines' expiry
// status is a plain string comparison against this value, same convention
// used everywhere else expiry is checked in this codebase.
'use client'
import { useEffect, useMemo, useState } from 'react'
import { Loader2, PackageX, Search, TriangleAlert, X } from 'lucide-react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { listInventory, rejectPrescription } from '../actions'
import { PHARMACY_DRUG_FORM_LABELS, type PharmacyInventoryItem } from '../types'

export interface EncounterBillLine {
  prescriptionId: string
  drugId: string | null
  drugName: string
  strength?: string
  form?: string
  dosage?: string
  frequency?: string
  duration?: string
  stockOnHand: number | null
  unitPriceRupees: number | null
  isExpired: boolean
  notInCatalogue: boolean
}

export interface EncounterBillGroup {
  encounterId: string
  patientId: string
  patientName: string
  doctorName: string | null
  lines: EncounterBillLine[]
}

interface LineState {
  selected: boolean
  quantity: number
  confirmExpired: boolean
}

// A pharmacist-chosen substitute for a not-in-catalogue line. Local to this
// dispense only — never written back to the prescription record.
interface Substitution {
  drugId: string
  drugName: string
  strength?: string
  form?: string
  stockOnHand: number | null
  unitPriceRupees: number | null
  expiryDate: string | null
}

export type PaymentMethod = 'cash' | 'card' | 'upi' | 'bank_transfer' | 'check' | 'other'

const PAYMENT_METHOD_OPTIONS: { value: PaymentMethod; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'card', label: 'Card' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'check', label: 'Cheque' },
  { value: 'other', label: 'Other' },
]

export interface EncounterBillSubmitPayload {
  encounterId: string
  patientId: string
  lines: { prescriptionId: string; drugId: string; quantity: number; confirmExpired: boolean }[]
  finalAmount: number
  paymentMethod: PaymentMethod
}

export interface EncounterBillDrawerProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  group?: EncounterBillGroup
  todayIso: string
  isSubmitting?: boolean
  onSubmit?: (payload: EncounterBillSubmitPayload) => Promise<void> | void
  // Called after a line is successfully rejected, so the parent can
  // refresh its queue data. The drawer itself removes the line locally
  // immediately, for instant feedback without waiting on a refetch.
  onLineRejected?: (prescriptionId: string) => void
}

function formatDrugLine(name: string, strength?: string, form?: string) {
  const nameStrength = [name, strength].filter(Boolean).join(' ')
  return form ? `${nameStrength} · ${form}` : nameStrength
}

function formatRupees(value: number): string {
  return `₹${value.toFixed(2)}`
}

function isExpiredStr(expiryDate: string | null, todayIso: string): boolean {
  return expiryDate !== null && expiryDate < todayIso
}

export default function EncounterBillDrawer({
  open = true,
  onOpenChange,
  group,
  todayIso,
  isSubmitting = false,
  onSubmit,
  onLineRejected,
}: EncounterBillDrawerProps) {
  const [lineStates, setLineStates] = useState<Record<string, LineState>>({})
  const [substitutions, setSubstitutions] = useState<Record<string, Substitution>>({})
  const [rejectedLineIds, setRejectedLineIds] = useState<Set<string>>(new Set())
  const [finalAmountInput, setFinalAmountInput] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [notes, setNotes] = useState('')

  // Catalogue + stock, for the substitute-medicine picker. Fetched once per
  // drawer open — this component only mounts while a specific encounter is
  // selected, so a fresh fetch per mount is correct (stock may have moved
  // since the queue was last loaded).
  const [inventoryItems, setInventoryItems] = useState<PharmacyInventoryItem[]>([])
  const [inventoryLoaded, setInventoryLoaded] = useState(false)
  const [pickerForPrescriptionId, setPickerForPrescriptionId] = useState<string | null>(null)
  const [pickerSearch, setPickerSearch] = useState('')

  // Reject-a-line dialog state
  const [rejectDialogPrescriptionId, setRejectDialogPrescriptionId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [rejectSubmitting, setRejectSubmitting] = useState(false)
  const [rejectError, setRejectError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    listInventory({ include_inactive: false }).then((result) => {
      if (cancelled) return
      if (result.ok) setInventoryItems(result.data)
      setInventoryLoaded(true)
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!group) return
    const initial: Record<string, LineState> = {}
    for (const line of group.lines) {
      const canSelect = !line.notInCatalogue && line.stockOnHand !== null && line.stockOnHand > 0
      initial[line.prescriptionId] = {
        selected: canSelect,
        quantity: 0,
        confirmExpired: false,
      }
    }
    setLineStates(initial)
    setSubstitutions({})
    setRejectedLineIds(new Set())
    setFinalAmountInput('')
    setPaymentMethod('cash')
    setNotes('')
  }, [group?.encounterId])

  // Merges a pharmacist-chosen substitution over the original line, if one
  // exists. Every place that reads "the line" for billing/validation
  // purposes goes through this, so a substitution is never accidentally
  // read from stale original data.
  function getEffectiveLine(line: EncounterBillLine): EncounterBillLine {
    const sub = substitutions[line.prescriptionId]
    if (!sub) return line
    return {
      ...line,
      drugId: sub.drugId,
      drugName: sub.drugName,
      strength: sub.strength,
      form: sub.form,
      stockOnHand: sub.stockOnHand,
      unitPriceRupees: sub.unitPriceRupees,
      isExpired: isExpiredStr(sub.expiryDate, todayIso),
      notInCatalogue: false,
    }
  }

  // Rejected lines are filtered out of everything below — they're gone from
  // this drawer's working set, not just visually struck through.
  const visibleOriginalLines = useMemo(
    () => (group ? group.lines.filter((l) => !rejectedLineIds.has(l.prescriptionId)) : []),
    [group, rejectedLineIds]
  )

  const effectiveLines = useMemo(
    () => visibleOriginalLines.map(getEffectiveLine),
    [visibleOriginalLines, substitutions, todayIso]
  )

  const selectedLines = useMemo(
    () => effectiveLines.filter((line) => lineStates[line.prescriptionId]?.selected),
    [effectiveLines, lineStates]
  )

  const subtotal = useMemo(() => {
    return selectedLines.reduce((sum, line) => {
      const state = lineStates[line.prescriptionId]
      const price = line.unitPriceRupees ?? 0
      return sum + price * (state?.quantity ?? 0)
    }, 0)
  }, [selectedLines, lineStates])

  const finalAmount = finalAmountInput.trim() === '' ? subtotal : Number(finalAmountInput)
  const isDiscounted = finalAmountInput.trim() !== '' && Math.abs(finalAmount - subtotal) > 0.005

  const hasInvalidSelectedQuantity = selectedLines.some((line) => {
    const state = lineStates[line.prescriptionId]
    const qty = state?.quantity ?? 0
    if (!Number.isInteger(qty) || qty < 1) return true
    if (line.stockOnHand !== null && qty > line.stockOnHand) return true
    if (line.isExpired && !state?.confirmExpired) return true
    return false
  })

  const submitDisabled =
    selectedLines.length === 0 ||
    hasInvalidSelectedQuantity ||
    !Number.isFinite(finalAmount) ||
    finalAmount < 0 ||
    !paymentMethod ||
    isSubmitting

  function toggleSelected(prescriptionId: string, checked: boolean) {
    setLineStates((current) => ({
      ...current,
      [prescriptionId]: { ...current[prescriptionId], selected: checked },
    }))
  }

  function updateQuantity(prescriptionId: string, quantity: number) {
    setLineStates((current) => ({
      ...current,
      [prescriptionId]: { ...current[prescriptionId], quantity },
    }))
  }

  function updateConfirmExpired(prescriptionId: string, confirmExpired: boolean) {
    setLineStates((current) => ({
      ...current,
      [prescriptionId]: { ...current[prescriptionId], confirmExpired },
    }))
  }

  function openPicker(prescriptionId: string) {
    setPickerForPrescriptionId(prescriptionId)
    setPickerSearch('')
  }

  function applySubstitution(prescriptionId: string, item: PharmacyInventoryItem) {
    const sub: Substitution = {
      drugId: item.drug.id,
      drugName: item.drug.name,
      strength: item.drug.strength ?? undefined,
      form: PHARMACY_DRUG_FORM_LABELS[item.drug.form],
      stockOnHand: item.inventory?.quantity_on_hand ?? null,
      unitPriceRupees: item.inventory?.unit_price_paise != null ? item.inventory.unit_price_paise / 100 : null,
      expiryDate: item.inventory?.expiry_date ?? null,
    }
    setSubstitutions((current) => ({ ...current, [prescriptionId]: sub }))

    // Convenience: auto-select the line once a valid, in-stock substitute
    // is chosen, so the pharmacist doesn't have to check a second box.
    const canSelect = sub.stockOnHand !== null && sub.stockOnHand > 0
    setLineStates((current) => ({
      ...current,
      [prescriptionId]: { selected: canSelect, quantity: 0, confirmExpired: false },
    }))

    setPickerForPrescriptionId(null)
    setPickerSearch('')
  }

  function clearSubstitution(prescriptionId: string) {
    setSubstitutions((current) => {
      const next = { ...current }
      delete next[prescriptionId]
      return next
    })
    setLineStates((current) => ({
      ...current,
      [prescriptionId]: { selected: false, quantity: 0, confirmExpired: false },
    }))
  }

  const pickerResults = useMemo(() => {
    const query = pickerSearch.trim().toLowerCase()
    const items = inventoryItems.filter((item) => item.drug.is_active)
    if (!query) return items.slice(0, 50)
    return items.filter(
      (item) =>
        item.drug.name.toLowerCase().includes(query) ||
        item.drug.generic_name?.toLowerCase().includes(query)
    )
  }, [inventoryItems, pickerSearch])

  function openRejectDialog(prescriptionId: string) {
    setRejectDialogPrescriptionId(prescriptionId)
    setRejectReason('')
    setRejectError(null)
  }

  async function submitReject() {
    if (!rejectDialogPrescriptionId || !rejectReason.trim()) return
    setRejectSubmitting(true)
    setRejectError(null)

    const result = await rejectPrescription({
      prescription_id: rejectDialogPrescriptionId,
      reason: rejectReason.trim(),
    })

    if (!result.ok) {
      setRejectError(result.error)
      setRejectSubmitting(false)
      return
    }

    const rejectedId = rejectDialogPrescriptionId
    setRejectedLineIds((current) => new Set(current).add(rejectedId))
    setLineStates((current) => {
      const next = { ...current }
      delete next[rejectedId]
      return next
    })
    setSubstitutions((current) => {
      const next = { ...current }
      delete next[rejectedId]
      return next
    })

    setRejectSubmitting(false)
    setRejectDialogPrescriptionId(null)
    setRejectReason('')
    onLineRejected?.(rejectedId)
  }

  async function handleSubmit() {
    if (!group || submitDisabled) return
    const lines = selectedLines.map((line) => {
      const state = lineStates[line.prescriptionId]
      return {
        prescriptionId: line.prescriptionId,
        drugId: line.drugId as string, // safe: selectable lines always have a drugId
        quantity: state.quantity,
        confirmExpired: state.confirmExpired,
      }
    })
    await onSubmit?.({
      encounterId: group.encounterId,
      patientId: group.patientId,
      lines,
      finalAmount,
      paymentMethod,
    })
  }

  if (!group) return null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="flex w-full max-w-lg flex-col gap-0 border-border bg-background p-0 max-md:inset-x-0 max-md:bottom-0 max-md:top-auto max-md:h-auto max-md:max-w-none max-md:border-l-0 max-md:border-t"
      >
        <SheetHeader className="flex-row items-center justify-between border-b border-border px-5 py-4">
          <div>
            <SheetTitle>Dispense & bill</SheetTitle>
            <p className="text-sm text-muted-foreground">{group.patientName}</p>
          </div>
          <SheetClose asChild>
            <Button variant="ghost" size="icon" aria-label="Close">
              <X aria-hidden="true" />
            </Button>
          </SheetClose>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-5">
          {group.doctorName && (
            <p className="text-sm text-muted-foreground">Prescribed by Dr. {group.doctorName}</p>
          )}

          {visibleOriginalLines.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <PackageX className="size-6 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">
                No medicines left to dispense — every line for this visit was rejected.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {visibleOriginalLines.map((originalLine) => {
                const line = getEffectiveLine(originalLine)
                const state = lineStates[line.prescriptionId]
                if (!state) return null
                const canSelect = !line.notInCatalogue
                const hasSubstitution = !!substitutions[originalLine.prescriptionId]

                return (
                  <div key={line.prescriptionId} className="rounded-lg border border-border p-3">
                    <div className="flex items-start gap-3">
                      <Checkbox
                        checked={state.selected}
                        disabled={!canSelect}
                        onCheckedChange={(checked) => toggleSelected(line.prescriptionId, checked === true)}
                        className="mt-1"
                      />
                      <div className="flex flex-1 flex-col gap-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium text-foreground">
                            {formatDrugLine(line.drugName, line.strength, line.form)}
                          </p>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-auto shrink-0 px-2 py-1 text-xs text-destructive hover:text-destructive"
                            onClick={() => openRejectDialog(originalLine.prescriptionId)}
                          >
                            Reject
                          </Button>
                        </div>
                        {hasSubstitution && (
                          <p className="text-xs text-muted-foreground">
                            Originally prescribed as &ldquo;{originalLine.drugName}&rdquo;
                          </p>
                        )}
                        {(originalLine.dosage || originalLine.frequency || originalLine.duration) && (
                          <p className="text-xs text-muted-foreground">
                            {[originalLine.dosage, originalLine.frequency, originalLine.duration].filter(Boolean).join(' · ')}
                          </p>
                        )}

                        {line.notInCatalogue ? (
                          <div className="mt-1 flex flex-col gap-2">
                            <p className="flex items-center gap-1 text-xs text-destructive">
                              <PackageX className="size-3.5" aria-hidden="true" />
                              Not in catalogue — cannot bill here
                            </p>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="w-fit"
                              onClick={() => openPicker(originalLine.prescriptionId)}
                            >
                              <Search className="mr-2 size-3.5" aria-hidden="true" />
                              Select medicine to dispense instead
                            </Button>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center gap-2">
                              <p className="text-xs text-muted-foreground">
                                Stock: {line.stockOnHand ?? 'unavailable'}
                                {line.unitPriceRupees != null && ` · ${formatRupees(line.unitPriceRupees)}/unit`}
                              </p>
                              {hasSubstitution && (
                                <Button
                                  type="button"
                                  variant="link"
                                  size="sm"
                                  className="h-auto px-0 text-xs"
                                  onClick={() => clearSubstitution(originalLine.prescriptionId)}
                                >
                                  Undo substitution
                                </Button>
                              )}
                            </div>

                            {state.selected && (
                              <div className="mt-2 flex flex-col gap-2">
                                <div className="flex items-center gap-2">
                                  <Label htmlFor={`qty-${line.prescriptionId}`} className="text-xs">Qty</Label>
                                  <Input
                                    id={`qty-${line.prescriptionId}`}
                                    type="number"
                                    min={1}
                                    value={state.quantity || ''}
                                    onChange={(e) => updateQuantity(line.prescriptionId, e.target.valueAsNumber || 0)}
                                    className="h-8 w-24"
                                    aria-invalid={
                                      state.quantity < 1 ||
                                      (line.stockOnHand !== null && state.quantity > line.stockOnHand)
                                    }
                                  />
                                  {line.stockOnHand !== null && state.quantity > line.stockOnHand && (
                                    <Badge variant="outline" className="border-destructive text-destructive">
                                      Exceeds stock
                                    </Badge>
                                  )}
                                </div>

                                {line.isExpired && (
                                  <>
                                    <Alert className="border-border bg-amber-500/15 text-amber-700 dark:text-amber-400 py-2">
                                      <TriangleAlert aria-hidden="true" className="size-4" />
                                      <AlertDescription className="text-amber-700 dark:text-amber-400">
                                        This batch has expired.
                                      </AlertDescription>
                                    </Alert>
                                    <label className="flex items-center gap-2 text-xs text-foreground">
                                      <Checkbox
                                        checked={state.confirmExpired}
                                        onCheckedChange={(checked) =>
                                          updateConfirmExpired(line.prescriptionId, checked === true)
                                        }
                                      />
                                      I confirm I&apos;m dispensing expired stock.
                                    </label>
                                  </>
                                )}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {visibleOriginalLines.length > 0 && (
            <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/20 p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Computed subtotal</span>
                <span className="font-medium text-foreground">{formatRupees(subtotal)}</span>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="final-amount" className="text-xs">Final amount to charge</Label>
                <Input
                  id="final-amount"
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder={subtotal.toFixed(2)}
                  value={finalAmountInput}
                  onChange={(e) => setFinalAmountInput(e.target.value)}
                />
                {isDiscounted && (
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    Discount of {formatRupees(subtotal - finalAmount)} — the admin will see this bill was discounted.
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="payment-method" className="text-xs">
                  Payment method <span className="text-destructive">*</span>
                </Label>
                <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}>
                  <SelectTrigger id="payment-method">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHOD_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Medicine is marked paid at dispense — collect payment from the patient before confirming.
                </p>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="dispense-notes" className="text-xs">Notes (optional)</Label>
                <Textarea id="dispense-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
              </div>
            </div>
          )}
        </div>

        <SheetFooter className="border-t border-border px-5 py-4 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => onOpenChange?.(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitDisabled}>
            {isSubmitting && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />}
            {isSubmitting ? 'Dispensing…' : `Collect ${formatRupees(finalAmount)} & dispense`}
          </Button>
        </SheetFooter>
      </SheetContent>

      {/* Substitute-medicine picker */}
      <Dialog
        open={pickerForPrescriptionId !== null}
        onOpenChange={(isOpen) => { if (!isOpen) { setPickerForPrescriptionId(null); setPickerSearch('') } }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Select medicine to dispense</DialogTitle>
            <DialogDescription>
              Choose a stocked drug from the catalogue instead of the prescribed name.
            </DialogDescription>
          </DialogHeader>

          <div className="relative">
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={pickerSearch}
              onChange={(e) => setPickerSearch(e.target.value)}
              placeholder="Search medicines…"
              className="pl-9"
              autoFocus
            />
          </div>

          <div className="max-h-80 overflow-y-auto rounded-md border border-border">
            {!inventoryLoaded ? (
              <p className="p-4 text-center text-sm text-muted-foreground">Loading…</p>
            ) : pickerResults.length === 0 ? (
              <p className="p-4 text-center text-sm text-muted-foreground">No medicines match your search.</p>
            ) : (
              pickerResults.map((item) => {
                const stock = item.inventory?.quantity_on_hand ?? null
                const price = item.inventory?.unit_price_paise != null ? item.inventory.unit_price_paise / 100 : null
                const outOfStock = stock === null || stock <= 0
                return (
                  <button
                    key={item.drug.id}
                    type="button"
                    disabled={outOfStock}
                    className="flex w-full items-center justify-between gap-3 border-b border-border px-3 py-2 text-left text-sm last:border-b-0 hover:bg-muted focus:bg-muted focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => pickerForPrescriptionId && applySubstitution(pickerForPrescriptionId, item)}
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">
                        {formatDrugLine(item.drug.name, item.drug.strength ?? undefined, PHARMACY_DRUG_FORM_LABELS[item.drug.form])}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {outOfStock ? 'Out of stock' : `Stock: ${stock}`}
                        {price != null && ` · ${formatRupees(price)}/unit`}
                      </p>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Reject-a-line confirmation */}
      <Dialog
        open={rejectDialogPrescriptionId !== null}
        onOpenChange={(isOpen) => { if (!isOpen) { setRejectDialogPrescriptionId(null); setRejectReason(''); setRejectError(null) } }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reject this prescription line</DialogTitle>
            <DialogDescription>
              The patient will not be dispensed this medicine. This cannot be undone from here — the doctor
              can prescribe it again if needed.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="reject-reason">
              Reason <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="reject-reason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. Insufficient stock, discontinued, out of stock indefinitely"
              rows={3}
              autoFocus
            />
            {rejectError && <p className="text-xs text-destructive">{rejectError}</p>}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setRejectDialogPrescriptionId(null); setRejectReason(''); setRejectError(null) }}
              disabled={rejectSubmitting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={submitReject}
              disabled={!rejectReason.trim() || rejectSubmitting}
            >
              {rejectSubmitting && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />}
              {rejectSubmitting ? 'Rejecting…' : 'Reject line'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Sheet>
  )
}