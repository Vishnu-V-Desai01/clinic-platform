//pharmacy/components/dispense-drawer.tsx
//
// Fixes applied from the original v0.dev output:
// - "expired" is now a prop (isExpired) computed server-side in IST, not
//   derived from the browser's Date.now() / local timezone.
// - No "prescribedQuantity" is trusted as ground truth — prescriptions has
//   no numeric quantity column, only free-text dosage/frequency/duration.
//   The quantity input starts blank and a caption explains why.
// - SheetClose uses asChild (standard Radix pattern) instead of a `render`
//   prop, which Radix-based SheetClose does not support.
// - data-icon="inline-start" replaced with explicit className spacing.
// - Drug name/strength/form line and stock-unit label now guard against
//   null/empty values instead of assuming they're always present.

import { useEffect, useMemo, useState } from 'react'
import { Loader2, PackageX, TriangleAlert, X } from 'lucide-react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'

export interface DispensePrescription {
  id: string
  patientName: string
  patientSubtitle?: string
  doctorName: string
  drugName: string
  strength?: string
  form?: string
  unit?: string
  // No prescribedQuantity — prescriptions.dosage/frequency/duration are free
  // text with no numeric total. Shown as context; the pharmacist enters the
  // actual quantity to dispense.
  dosage?: string
  frequency?: string
  duration?: string
  instructions?: string
  stockOnHand: number | null
  reorderThreshold: number | null
  expiryDate?: string | null
  isExpired?: boolean // computed server-side in IST — never derive this from the browser clock
  notInCatalogue?: boolean
}

export interface DispenseDrawerProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  prescription?: DispensePrescription
  isSubmitting?: boolean
  onDispense?: (values: { quantity: number; notes: string; confirmExpired: boolean }) => Promise<void> | void
  onAddToCatalogue?: () => void
}

const defaultPrescription: DispensePrescription = {
  id: 'rx-1048',
  patientName: 'Priya Sharma',
  doctorName: 'Meera Iyer',
  drugName: 'Paracetamol',
  strength: '650mg',
  form: 'Tablet',
  unit: 'tablets',
  dosage: '1 tablet',
  frequency: 'Twice daily',
  duration: '5 days',
  instructions: 'After food.',
  stockOnHand: 340,
  reorderThreshold: 50,
}

function formatExpiryDate(date: string) {
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(date))
}

// Joins name/strength/form without stray separators when a field is missing.
function formatDrugLine(name: string, strength?: string, form?: string) {
  const nameStrength = [name, strength].filter(Boolean).join(' ')
  return form ? `${nameStrength} · ${form}` : nameStrength
}

export default function DispenseDrawer({
  open = true,
  onOpenChange,
  prescription = defaultPrescription,
  isSubmitting = false,
  onDispense,
  onAddToCatalogue,
}: DispenseDrawerProps) {
  const [quantityToDispense, setQuantityToDispense] = useState(0)
  const [notes, setNotes] = useState('')
  const [confirmExpired, setConfirmExpired] = useState(false)

  useEffect(() => {
    setQuantityToDispense(0)
    setNotes('')
    setConfirmExpired(false)
  }, [prescription.id])

  const quantityIsInvalid = !Number.isInteger(quantityToDispense) || quantityToDispense < 1
  const insufficient = prescription.stockOnHand !== null && quantityToDispense > prescription.stockOnHand
  const expired = Boolean(prescription.isExpired)
  const lowStock =
    prescription.stockOnHand !== null &&
    prescription.reorderThreshold !== null &&
    prescription.stockOnHand < prescription.reorderThreshold &&
    !insufficient
  const dispenseDisabled = Boolean(
    prescription.notInCatalogue || insufficient || quantityIsInvalid || (expired && !confirmExpired) || isSubmitting
  )

  const stockLabel = useMemo(() => {
    if (prescription.stockOnHand === null) return 'Stock unavailable'
    return `Current stock: ${prescription.stockOnHand} ${prescription.unit || 'units'}`
  }, [prescription.stockOnHand, prescription.unit])

  async function handleDispense() {
    if (dispenseDisabled) return
    await onDispense?.({ quantity: quantityToDispense, notes: notes.trim(), confirmExpired })
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="w-full max-w-md gap-0 border-border bg-background p-0 max-md:inset-x-0 max-md:bottom-0 max-md:top-auto max-md:h-auto max-md:max-w-none max-md:border-l-0 max-md:border-t"
      >
        <SheetHeader className="flex-row items-center justify-between border-b border-border px-5 py-4">
          <SheetTitle>Dispense medicine</SheetTitle>
          <SheetClose asChild>
            <Button variant="ghost" size="icon" aria-label="Close">
              <X aria-hidden="true" />
            </Button>
          </SheetClose>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-5">
          <section aria-labelledby="prescription-summary" className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
            <h2 id="prescription-summary" className="sr-only">Prescription summary</h2>
            <div>
              <p className="font-medium text-foreground">{prescription.patientName}</p>
              {prescription.patientSubtitle && <p className="text-xs text-muted-foreground">{prescription.patientSubtitle}</p>}
              <p className="mt-2 text-sm text-muted-foreground">Prescribed by Dr. {prescription.doctorName}</p>
            </div>
            <p className="text-sm font-medium text-foreground">
              {formatDrugLine(prescription.drugName, prescription.strength, prescription.form)}
            </p>
            {(prescription.dosage || prescription.frequency || prescription.duration) && (
              <p className="text-sm text-foreground">
                {[prescription.dosage, prescription.frequency, prescription.duration].filter(Boolean).join(' · ')}
              </p>
            )}
            {prescription.instructions && <p className="border-t border-border pt-2 text-sm text-muted-foreground">{prescription.instructions}</p>}
          </section>

          {prescription.notInCatalogue ? (
            <section className="flex items-start gap-3 rounded-lg border border-border bg-card p-4" aria-label="Catalogue status">
              <PackageX aria-hidden="true" className="mt-0.5 shrink-0 text-muted-foreground" />
              <p className="text-sm text-foreground">This drug isn&apos;t in your pharmacy catalogue yet.</p>
            </section>
          ) : (
            <section aria-labelledby="stock-status" className="flex flex-col gap-3">
              <h2 id="stock-status" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Stock status</h2>
              <div className="flex min-h-10 items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2">
                <span className="text-sm text-foreground">{stockLabel}</span>
                {lowStock && <Badge className="gap-1 bg-amber-500/15 text-amber-700 dark:text-amber-400"><TriangleAlert aria-hidden="true" /> Low stock</Badge>}
                {!lowStock && !insufficient && prescription.stockOnHand !== null && <Badge variant="secondary">Available</Badge>}
              </div>
              {insufficient && <Alert variant="destructive"><TriangleAlert aria-hidden="true" /><AlertDescription>Only {prescription.stockOnHand} units in stock — cannot dispense {quantityToDispense}.</AlertDescription></Alert>}
              {expired && <Alert className="border-border bg-amber-500/15 text-amber-700 dark:text-amber-400"><TriangleAlert aria-hidden="true" /><AlertDescription className="text-amber-700 dark:text-amber-400">{prescription.expiryDate ? `This batch expired on ${formatExpiryDate(prescription.expiryDate)}.` : 'This batch has expired.'}</AlertDescription></Alert>}
              {expired && <label className="flex items-center gap-2 text-sm text-foreground"><Checkbox checked={confirmExpired} onCheckedChange={(checked) => setConfirmExpired(checked === true)} />I confirm I&apos;m dispensing expired stock.</label>}
            </section>
          )}

          {!prescription.notInCatalogue && <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="quantity-to-dispense">Quantity to dispense</Label>
              <Input id="quantity-to-dispense" type="number" min={1} value={quantityToDispense || ''} onChange={(event) => setQuantityToDispense(event.target.valueAsNumber || 0)} aria-invalid={insufficient || quantityIsInvalid} />
              <p className="text-xs text-muted-foreground">Confirm the total based on the dosage above — this isn&apos;t calculated automatically.</p>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="dispense-notes">Notes (optional)</Label>
              <Textarea id="dispense-notes" value={notes} onChange={(event) => setNotes(event.target.value)} rows={4} />
            </div>
          </div>}
        </div>

        <SheetFooter className="border-t border-border px-5 py-4 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => onOpenChange?.(false)}>Cancel</Button>
          {prescription.notInCatalogue ? <Button variant="outline" onClick={onAddToCatalogue}>Add to catalogue</Button> : <Button onClick={handleDispense} disabled={dispenseDisabled}>{isSubmitting && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />}{isSubmitting ? 'Dispensing…' : 'Dispense'}</Button>}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}