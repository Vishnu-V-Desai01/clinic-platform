//pharmacy/components/pharmacy-inventory.tsx
//
// Chat B addition: unit price (objective 2). Stored as unit_price_paise in
// pharmacy_inventory (already existed, previously unused by the UI). Shown
// and edited in rupees; converted to paise at the client boundary before
// calling the server action.
//
// Price uses plain "₹" + toFixed(2) formatting, not the project's shared
// formatINR() helper — that file's import path wasn't available when this
// was written. Functionally correct; swap in formatINR() once confirmed.

import { useMemo, useState } from 'react'
import { CalendarClock, IndianRupee, Package, PackageX, Pencil, Plus, Search, TriangleAlert } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { PHARMACY_DRUG_FORM_VALUES, PHARMACY_DRUG_FORM_LABELS, type PharmacyDrugForm } from '../types'

export type DrugStatus = 'ok' | 'low' | 'expiring_soon' | 'expired' | 'not_stocked'

export interface DrugRow {
  id: string
  name: string
  genericName?: string
  form: string
  strength?: string
  onHand: number | null // null = drug exists in catalogue but has no inventory row yet
  reorderThreshold: number | null
  expiryDate?: string
  unitPriceRupees: number | null // null = price not set yet
  status: DrugStatus
  isActive: boolean
}

export interface AddDrugValues {
  name: string
  genericName?: string
  form: PharmacyDrugForm
  strength?: string
  unit?: string
}

export interface AddStockValues {
  drugId: string
  quantityOnHand: number
  reorderThreshold?: number
  expiryDate?: string
  unitPriceRupees?: number
}

interface PharmacyInventoryProps {
  drugs?: DrugRow[]
  onAddDrug?: (values: AddDrugValues) => Promise<void> | void
  onUpdateOnHand?: (drugId: string, onHand: number) => Promise<void> | void
  onInitializeStock?: (values: AddStockValues) => Promise<void> | void
  onUpdatePrice?: (drugId: string, priceRupees: number) => Promise<void> | void
}

const seedDrugs: DrugRow[] = [
  { id: 'paracetamol', name: 'Paracetamol 650mg', genericName: 'Paracetamol', form: 'Tablet', strength: '650mg', onHand: 340, reorderThreshold: 50, expiryDate: '2027-03-01', unitPriceRupees: 1.5, status: 'ok', isActive: true },
  { id: 'azithromycin', name: 'Azithromycin 500mg', genericName: 'Azithromycin', form: 'Tablet', strength: '500mg', onHand: 28, reorderThreshold: 40, expiryDate: '2027-01-01', unitPriceRupees: 12, status: 'low', isActive: true },
  { id: 'pantoprazole', name: 'Pantoprazole 40mg', genericName: 'Pantoprazole', form: 'Tablet', strength: '40mg', onHand: 210, reorderThreshold: 40, expiryDate: '2026-09-01', unitPriceRupees: 6.5, status: 'expiring_soon', isActive: true },
  { id: 'cetirizine', name: 'Cetirizine 10mg', genericName: 'Cetirizine', form: 'Tablet', strength: '10mg', onHand: 500, reorderThreshold: 60, expiryDate: '2027-06-01', unitPriceRupees: 2, status: 'ok', isActive: true },
  { id: 'metformin', name: 'Metformin 500mg', genericName: 'Metformin', form: 'Tablet', strength: '500mg', onHand: 175, reorderThreshold: 50, expiryDate: '2026-12-01', unitPriceRupees: 3, status: 'ok', isActive: true },
  { id: 'amoxicillin', name: 'Amoxicillin 250mg', genericName: 'Amoxicillin', form: 'Capsule', strength: '250mg', onHand: 60, reorderThreshold: 40, expiryDate: '2026-08-15', unitPriceRupees: 8, status: 'expired', isActive: true },
  { id: 'ors', name: 'ORS Sachet', genericName: 'Oral rehydration salts', form: 'Sachet', onHand: 900, reorderThreshold: 100, expiryDate: '2027-11-01', unitPriceRupees: 15, status: 'ok', isActive: true },
  { id: 'amoxyclav', name: 'Amoxyclav 625mg', genericName: 'Amoxicillin + Clavulanate', form: 'Tablet', strength: '625mg', onHand: 44, reorderThreshold: 40, expiryDate: '2027-02-01', unitPriceRupees: 18, status: 'ok', isActive: false },
  { id: 'vitamin-d', name: 'Vitamin D3 60000 IU', genericName: 'Cholecalciferol', form: 'Sachet', strength: '60000 IU', onHand: null, reorderThreshold: null, unitPriceRupees: null, status: 'not_stocked', isActive: true },
]

const statusMeta: Record<DrugStatus, { label: string; icon?: typeof TriangleAlert; className?: string }> = {
  ok: { label: 'OK' },
  low: { label: 'Low stock', icon: TriangleAlert, className: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' },
  expiring_soon: { label: 'Expiring soon', icon: CalendarClock, className: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' },
  expired: { label: 'Expired', icon: PackageX, className: 'bg-destructive/15 text-destructive' },
  not_stocked: { label: 'Not stocked', icon: Package, className: 'bg-muted text-muted-foreground' },
}

const dateFormatter = new Intl.DateTimeFormat('en-IN', { month: 'short', year: 'numeric' })

// TODO: replace with the project's shared formatINR() once its import path
// is confirmed.
function formatRupees(value: number): string {
  return `₹${value.toFixed(2)}`
}

export default function PharmacyInventory({
  drugs = seedDrugs,
  onAddDrug,
  onUpdateOnHand,
  onInitializeStock,
  onUpdatePrice,
}: PharmacyInventoryProps) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | DrugStatus>('all')
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<{ name: string; genericName: string; form: PharmacyDrugForm; strength: string; unit: string }>({
    name: '',
    genericName: '',
    form: 'tablet',
    strength: '',
    unit: '',
  })
  const [stockDialogDrug, setStockDialogDrug] = useState<DrugRow | null>(null)
  const [stockForm, setStockForm] = useState({ quantity: '', reorderThreshold: '', expiryDate: '', unitPrice: '' })

  const filteredDrugs = useMemo(() => {
    const query = search.trim().toLowerCase()
    return drugs.filter((drug) => {
      const matchesSearch = !query || drug.name.toLowerCase().includes(query) || drug.genericName?.toLowerCase().includes(query)
      return matchesSearch && (statusFilter === 'all' || drug.status === statusFilter)
    })
  }, [drugs, search, statusFilter])

  const updateForm = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }))
  const submitDrug = async () => {
    if (!form.name.trim()) return
    await onAddDrug?.({ ...form, name: form.name.trim() })
    setForm({ name: '', genericName: '', form: 'tablet', strength: '', unit: '' })
    setOpen(false)
  }

  const submitStock = async () => {
    if (!stockDialogDrug) return
    const quantity = Number(stockForm.quantity)
    if (!Number.isFinite(quantity) || quantity < 0) return
    const price = stockForm.unitPrice ? Number(stockForm.unitPrice) : undefined
    if (stockForm.unitPrice && (!Number.isFinite(price) || (price as number) < 0)) return
    await onInitializeStock?.({
      drugId: stockDialogDrug.id,
      quantityOnHand: quantity,
      reorderThreshold: stockForm.reorderThreshold ? Number(stockForm.reorderThreshold) : undefined,
      expiryDate: stockForm.expiryDate || undefined,
      unitPriceRupees: price,
    })
    setStockForm({ quantity: '', reorderThreshold: '', expiryDate: '', unitPrice: '' })
    setStockDialogDrug(null)
  }

  return (
    <main className="min-h-full bg-background px-4 py-6 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight">Inventory</h1>
            <p className="text-sm text-muted-foreground">Manage your pharmacy&apos;s drug catalogue and stock.</p>
          </div>
          <Button onClick={() => setOpen(true)} className="w-full sm:w-auto"><Plus className="mr-2 size-4" aria-hidden="true" />Add drug</Button>
        </header>

        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="relative w-full md:max-w-sm">
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search drugs…" aria-label="Search drugs" className="pl-9" />
          </div>
          <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as 'all' | DrugStatus)}>
            <SelectTrigger className="w-full md:w-48" aria-label="Filter by status"><SelectValue placeholder="All statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="ok">OK</SelectItem>
              <SelectItem value="low">Low stock</SelectItem>
              <SelectItem value="expiring_soon">Expiring soon</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
              <SelectItem value="not_stocked">Not stocked</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Card className="overflow-hidden">
          <CardContent className="p-0">
            {drugs.length === 0 ? (
              <div className="flex min-h-72 flex-col items-center justify-center gap-4 px-6 text-center"><PackageX className="size-8 text-muted-foreground" /><div className="flex flex-col gap-1"><h2 className="font-medium">Your drug catalogue is empty</h2><p className="text-sm text-muted-foreground">Add medicines to start managing pharmacy stock.</p></div><Button onClick={() => setOpen(true)}>Add your first drug</Button></div>
            ) : filteredDrugs.length === 0 ? (
              <div className="flex min-h-72 flex-col items-center justify-center gap-3 px-6 text-center"><Search className="size-8 text-muted-foreground" /><h2 className="font-medium">No drugs match your filters</h2><Button variant="secondary" onClick={() => { setSearch(''); setStatusFilter('all') }}>Clear filters</Button></div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Name</TableHead><TableHead>Generic name</TableHead><TableHead>Form</TableHead><TableHead>Strength</TableHead><TableHead>On hand</TableHead><TableHead>Price/unit</TableHead><TableHead>Reorder threshold</TableHead><TableHead>Expiry date</TableHead><TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredDrugs.map((drug) => {
                      const meta = statusMeta[drug.status]
                      const Icon = meta.icon
                      return (
                        <TableRow key={drug.id} className={cn(!drug.isActive && 'opacity-60')}>
                          <TableCell className="whitespace-nowrap font-medium">{drug.name}</TableCell>
                          <TableCell className="whitespace-nowrap text-muted-foreground">{drug.genericName || '—'}</TableCell>
                          <TableCell>{drug.form}</TableCell>
                          <TableCell>{drug.strength || '—'}</TableCell>
                          <TableCell>
                            {drug.onHand === null ? (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setStockDialogDrug(drug)}
                              >
                                Stock now
                              </Button>
                            ) : (
                              <div className="flex items-center gap-1">
                                <Input
                                  key={`${drug.id}-onhand-${drug.onHand}`}
                                  type="number"
                                  min="0"
                                  defaultValue={drug.onHand}
                                  aria-label={`On hand for ${drug.name}`}
                                  className="h-8 w-20"
                                  onBlur={(event) => {
                                    const value = Number(event.target.value)
                                    if (Number.isFinite(value) && value >= 0 && value !== drug.onHand) onUpdateOnHand?.(drug.id, value)
                                  }}
                                />
                                <Pencil aria-hidden="true" className="size-3.5 text-muted-foreground" />
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            {drug.onHand === null ? (
                              <span className="text-muted-foreground">—</span>
                            ) : (
                              <div className="flex items-center gap-1">
                                <IndianRupee aria-hidden="true" className="size-3.5 text-muted-foreground" />
                                <Input
                                  key={`${drug.id}-price-${drug.unitPriceRupees ?? 'unset'}`}
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  defaultValue={drug.unitPriceRupees ?? ''}
                                  placeholder="Set price"
                                  aria-label={`Price per unit for ${drug.name}`}
                                  className="h-8 w-24"
                                  onBlur={(event) => {
                                    const value = Number(event.target.value)
                                    if (Number.isFinite(value) && value >= 0 && value !== drug.unitPriceRupees) onUpdatePrice?.(drug.id, value)
                                  }}
                                />
                              </div>
                            )}
                          </TableCell>
                          <TableCell>{drug.reorderThreshold ?? '—'}</TableCell>
                          <TableCell className="whitespace-nowrap">{drug.expiryDate ? dateFormatter.format(new Date(drug.expiryDate)) : '—'}</TableCell>
                          <TableCell><Badge variant={drug.status === 'ok' ? 'secondary' : 'outline'} className={cn('gap-1 whitespace-nowrap', meta.className)}>{Icon && <Icon aria-hidden="true" />}{meta.label}</Badge></TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add drug</DialogTitle><DialogDescription>Add a medicine to the clinic pharmacy catalogue.</DialogDescription></DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="drug-name">Name <span className="text-destructive">*</span></Label>
              <Input id="drug-name" value={form.name} onChange={(event) => updateForm('name', event.target.value)} placeholder="e.g. Paracetamol 650mg" required />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="generic-name">Generic name</Label>
                <Input id="generic-name" value={form.genericName} onChange={(event) => updateForm('genericName', event.target.value)} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="drug-form">Form</Label>
                <Select value={form.form} onValueChange={(value) => updateForm('form', value)}>
                  <SelectTrigger id="drug-form"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PHARMACY_DRUG_FORM_VALUES.map((value) => (
                      <SelectItem key={value} value={value}>{PHARMACY_DRUG_FORM_LABELS[value]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="strength">Strength</Label>
                <Input id="strength" value={form.strength} onChange={(event) => updateForm('strength', event.target.value)} placeholder="e.g. 650mg" />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="unit">Unit</Label>
                <Input id="unit" value={form.unit} onChange={(event) => updateForm('unit', event.target.value)} placeholder="e.g. strip, bottle" />
              </div>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={submitDrug} disabled={!form.name.trim()}>Add drug</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={stockDialogDrug !== null} onOpenChange={(isOpen) => !isOpen && setStockDialogDrug(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Stock {stockDialogDrug?.name}</DialogTitle>
            <DialogDescription>Set the starting quantity and price for this drug. You can adjust both later.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="stock-quantity">Quantity on hand <span className="text-destructive">*</span></Label>
              <Input id="stock-quantity" type="number" min="0" value={stockForm.quantity} onChange={(event) => setStockForm((current) => ({ ...current, quantity: event.target.value }))} required />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="stock-price">Price per unit (₹)</Label>
                <Input id="stock-price" type="number" min="0" step="0.01" value={stockForm.unitPrice} onChange={(event) => setStockForm((current) => ({ ...current, unitPrice: event.target.value }))} placeholder="Optional" />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="stock-threshold">Reorder threshold</Label>
                <Input id="stock-threshold" type="number" min="0" value={stockForm.reorderThreshold} onChange={(event) => setStockForm((current) => ({ ...current, reorderThreshold: event.target.value }))} placeholder="Optional" />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="stock-expiry">Expiry date</Label>
              <Input id="stock-expiry" type="date" value={stockForm.expiryDate} onChange={(event) => setStockForm((current) => ({ ...current, expiryDate: event.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStockDialogDrug(null)}>Cancel</Button>
            <Button onClick={submitStock} disabled={!stockForm.quantity}>Save stock</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  )
}

export { seedDrugs, formatRupees }