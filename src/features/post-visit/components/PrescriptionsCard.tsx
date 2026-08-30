// src/features/post-visit/components/PrescriptionsCard.tsx
//
// Card 1 of 5 in the Post-Visit wizard.
// Always controlled — wizard shell owns all state.
// Soft-deletes via isDeleted:true so the server can:
//   - call deleteMedicine() on removed care-plan rows (carePlanMedicineId set)
//   - skip newly-added rows that the doctor removed (no carePlanMedicineId)
// No hardcoded data. Pre-fill comes from the wizard's initial state (seeded
// by getVisitPrefill which reads care_plan_medicines).
//
// Chat B addition (objective 3): catalogue-backed prescribing.
//   - Typing in the medicine name field shows a live autocomplete dropdown
//     matching the clinic's pharmacy catalogue.
//   - A "Select from inventory" button opens a search modal over the same
//     catalogue for browsing rather than typing.
//   - Either path sets drugId on the line, which the pharmacy queue later
//     uses to match reliably instead of case-insensitive name matching.
//   - drugId is set ONLY by an explicit selection (dropdown click or picker
//     click) and is cleared by any manual keystroke in the name field —
//     this keeps drugId from ever silently pointing at a name that no
//     longer matches what's displayed.
//   - Free text remains fully supported: a medicine not in the catalogue,
//     or a handwritten-prescription case, just leaves drugId unset. The
//     pharmacy queue shows these as "Not in catalogue," which is expected.
//   - The picker deliberately does NOT show stock levels — it queries the
//     catalogue only (pharmacy_drugs, doctor-visible per the Chat A RLS
//     split), never pharmacy_inventory, so a doctor without pharmacy_access
//     never sees stock data through this component.
//
// Item 7 addition: a second autocomplete source layered onto the SAME
// dropdown as the catalogue suggestions — distinct medicine names this
// clinic has prescribed before, even ones never matched to a catalogue
// drug. Fetched via a debounced server action (searchPastMedicineNames),
// since past-prescription names live in a different table the catalogue
// (already loaded client-side in full) doesn't cover. Catalogue matches
// are listed first (richer detail available), then past-name matches not
// already covered by a catalogue result, case-insensitively de-duplicated.
// A past-name suggestion carries no drugId when selected — it's exactly
// equivalent to typing that text manually, just faster.

'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ListFilter, Pill, Plus, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { listDrugs } from '@/features/pharmacy/actions'
import { searchPastMedicineNames } from '../actions'
import { PHARMACY_DRUG_FORM_LABELS, type PharmacyDrugRow } from '@/features/pharmacy/types'
import type { PrescriptionLine } from '../types'

interface PrescriptionsCardProps {
  value:    PrescriptionLine[]
  onChange: (lines: PrescriptionLine[]) => void
}

const FREQUENCY_OPTIONS = [
  'Once daily',
  'Twice daily',
  'Three times daily',
  'Four times daily',
  'Every 8 hours',
  'Every 12 hours',
  'Weekly',
  'As needed',
  'Nightly',
]

const emptyForm = {
  medicineName: '',
  drugId:       undefined as string | undefined,
  dosage:       '',
  frequency:    '',
  duration:     '',
  instructions: '',
}

const MAX_CATALOGUE_SUGGESTIONS = 6
const MAX_PAST_NAME_SUGGESTIONS = 4
const PAST_NAME_SEARCH_DEBOUNCE_MS = 250
const PAST_NAME_MIN_QUERY_LENGTH = 2

function drugDisplayLabel(drug: PharmacyDrugRow): string {
  const parts = [drug.name]
  if (drug.strength) parts[0] = `${drug.name} ${drug.strength}`
  return parts[0]
}

function drugSubLabel(drug: PharmacyDrugRow): string {
  const bits: string[] = [PHARMACY_DRUG_FORM_LABELS[drug.form]]
  if (drug.generic_name) bits.push(drug.generic_name)
  return bits.join(' · ')
}

// Collapses runs of internal whitespace and trims — applied on save so the
// stored name is clean without ever changing its casing (a brand name like
// "Crocin" shouldn't be lowercased just because search comparisons are
// case-insensitive).
function normalizeMedicineName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ')
}

export default function PrescriptionsCard({ value, onChange }: PrescriptionsCardProps) {
  const [showForm, setShowForm] = useState(false)
  const [form, setForm]         = useState(emptyForm)

  // Catalogue, fetched once. A doctor with no pharmacy_access still gets
  // this list (catalogue read stays doctor-visible per Chat A's RLS split);
  // an empty result (module disabled, or no drugs yet) just means the
  // autocomplete/picker silently offer nothing — free text still works.
  const [drugs, setDrugs]             = useState<PharmacyDrugRow[]>([])
  const [drugsLoaded, setDrugsLoaded] = useState(false)

  // Item 7: past-prescription-name suggestions, debounced against the
  // server. Kept separate from the catalogue's instant in-memory filter —
  // the catalogue has no network cost so it stays snappy; this one does,
  // so it gets its own debounce and minimum-length gate.
  const [pastNames, setPastNames]           = useState<string[]>([])
  const pastNamesDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pastNamesRequestId = useRef(0)

  const [showSuggestions, setShowSuggestions] = useState(false)
  const suggestionsBlurTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [pickerOpen, setPickerOpen]     = useState(false)
  const [pickerSearch, setPickerSearch] = useState('')

  useEffect(() => {
    let cancelled = false
    listDrugs(false).then((result) => {
      if (cancelled) return
      if (result.ok) setDrugs(result.data)
      setDrugsLoaded(true)
    })
    return () => { cancelled = true }
  }, [])

  // Debounced fetch of past-prescription-name matches whenever the typed
  // name changes. requestId guards against an earlier, slower request
  // resolving after a newer one and clobbering fresher results.
  useEffect(() => {
    const query = form.medicineName.trim()

    if (pastNamesDebounce.current) clearTimeout(pastNamesDebounce.current)

    if (query.length < PAST_NAME_MIN_QUERY_LENGTH) {
      setPastNames([])
      return
    }

    pastNamesDebounce.current = setTimeout(() => {
      const thisRequestId = ++pastNamesRequestId.current
      searchPastMedicineNames(query).then((names) => {
        if (thisRequestId !== pastNamesRequestId.current) return // stale response, ignore
        setPastNames(names)
      })
    }, PAST_NAME_SEARCH_DEBOUNCE_MS)

    return () => {
      if (pastNamesDebounce.current) clearTimeout(pastNamesDebounce.current)
    }
  }, [form.medicineName])

  const catalogueSuggestions = useMemo(() => {
    const query = form.medicineName.trim().toLowerCase()
    if (!query) return []
    return drugs
      .filter((d) => d.name.toLowerCase().includes(query))
      .slice(0, MAX_CATALOGUE_SUGGESTIONS)
  }, [drugs, form.medicineName])

  // Past-name suggestions, with anything already represented by a
  // catalogue match above filtered out (case-insensitive), so a drug in
  // the catalogue never appears twice in the same dropdown.
  const pastNameSuggestions = useMemo(() => {
    const catalogueNames = new Set(catalogueSuggestions.map((d) => d.name.toLowerCase()))
    return pastNames
      .filter((name) => !catalogueNames.has(name.toLowerCase()))
      .slice(0, MAX_PAST_NAME_SUGGESTIONS)
  }, [pastNames, catalogueSuggestions])

  const pickerResults = useMemo(() => {
    const query = pickerSearch.trim().toLowerCase()
    if (!query) return drugs.slice(0, 50)
    return drugs.filter(
      (d) =>
        d.name.toLowerCase().includes(query) ||
        d.generic_name?.toLowerCase().includes(query),
    )
  }, [drugs, pickerSearch])

  // Visible = not soft-deleted
  const visibleLines = value.filter((rx) => !rx.isDeleted)

  // Always soft-delete: keeps the row so completeVisit can decide whether
  // to call deleteMedicine() (carePlanMedicineId set) or just ignore it.
  const handleRemove = (localId: string) =>
    onChange(value.map((rx) => rx.localId === localId ? { ...rx, isDeleted: true } : rx))

  const handleAdd = () => {
    const cleanName = normalizeMedicineName(form.medicineName)
    if (!cleanName) return
    const newLine: PrescriptionLine = {
      localId:      crypto.randomUUID(),
      medicineName: cleanName,
      drugId:       form.drugId,
      dosage:       form.dosage.trim()       || undefined,
      frequency:    form.frequency           || undefined,
      duration:     form.duration.trim()     || undefined,
      instructions: form.instructions.trim() || undefined,
      status:       'active',
      isDeleted:    false,
    }
    onChange([...value, newLine])
    setForm(emptyForm)
    setShowForm(false)
  }

  // Manual typing always invalidates any prior catalogue selection — drugId
  // must only ever reflect an explicit pick, never a guess.
  const handleNameChange = (text: string) => {
    setForm((f) => ({ ...f, medicineName: text, drugId: undefined }))
    setShowSuggestions(true)
  }

  const selectDrug = (drug: PharmacyDrugRow) => {
    setForm((f) => ({ ...f, medicineName: drugDisplayLabel(drug), drugId: drug.id }))
    setShowSuggestions(false)
  }

  // Selecting a past-prescription-name suggestion is exactly equivalent to
  // typing that text manually — no drugId, since it was never matched to
  // a catalogue row (if it had been, it would show as a catalogue
  // suggestion instead and this path wouldn't apply).
  const selectPastName = (name: string) => {
    setForm((f) => ({ ...f, medicineName: name, drugId: undefined }))
    setShowSuggestions(false)
  }

  const selectFromPicker = (drug: PharmacyDrugRow) => {
    selectDrug(drug)
    setPickerOpen(false)
    setPickerSearch('')
  }

  const handleNameBlur = () => {
    // Delay so a click on a suggestion item registers before the list
    // unmounts (standard combobox blur-race workaround).
    suggestionsBlurTimeout.current = setTimeout(() => setShowSuggestions(false), 150)
  }

  const handleNameFocus = () => {
    if (suggestionsBlurTimeout.current) clearTimeout(suggestionsBlurTimeout.current)
    if (form.medicineName.trim()) setShowSuggestions(true)
  }

  const hasAnySuggestions = catalogueSuggestions.length > 0 || pastNameSuggestions.length > 0

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-foreground">Prescriptions</h2>
        <p className="text-sm text-muted-foreground">
          Pre-filled from care plan · editable · changes sync back to care plan on save
        </p>
      </div>

      {/* List or empty state */}
      {visibleLines.length === 0 && !showForm ? (
        <div className="flex flex-col items-center gap-3 py-10">
          <p className="text-sm text-muted-foreground">No medicines for this visit.</p>
          <Button
            variant="ghost"
            size="sm"
            className="text-primary hover:text-primary/90"
            onClick={() => setShowForm(true)}
          >
            <Plus className="mr-2 h-4 w-4" />
            Add medicine
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {visibleLines.map((rx) => (
            <div
              key={rx.localId}
              className="flex items-start gap-3 rounded-lg border border-border p-3"
            >
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded bg-primary/10">
                <Pill className="h-4 w-4 text-primary" />
              </div>

              <div className="flex flex-1 flex-col gap-1">
                <p className="text-sm font-medium text-foreground">{rx.medicineName}</p>
                <div className="flex flex-wrap items-center gap-2">
                  {rx.dosage    && <Badge variant="secondary" className="text-xs">{rx.dosage}</Badge>}
                  {rx.frequency && <Badge variant="secondary" className="text-xs">{rx.frequency}</Badge>}
                  {rx.duration  && (
                    <span className="text-xs text-muted-foreground">{rx.duration}</span>
                  )}
                </div>
                {rx.instructions && (
                  <p className="text-xs text-muted-foreground">{rx.instructions}</p>
                )}
                <div className="flex items-center gap-2">
                  {rx.carePlanMedicineId && (
                    <span className="text-xs text-muted-foreground/50">from care plan</span>
                  )}
                  {rx.drugId && (
                    <span className="text-xs text-emerald-600 dark:text-emerald-400">in catalogue</span>
                  )}
                </div>
              </div>

              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                onClick={() => handleRemove(rx.localId)}
                aria-label={`Remove ${rx.medicineName}`}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}

          {!showForm && (
            <Button
              variant="ghost"
              size="sm"
              className="w-fit text-primary hover:text-primary/90"
              onClick={() => setShowForm(true)}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add medicine
            </Button>
          )}
        </div>
      )}

      {/* Inline add form */}
      {showForm && (
        <div className="rounded-lg border border-border bg-muted/20 p-4">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pv-med-name">
                Medicine name <span className="text-destructive">*</span>
              </Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    id="pv-med-name"
                    placeholder="e.g. Lisinopril"
                    autoComplete="off"
                    value={form.medicineName}
                    onChange={(e) => handleNameChange(e.target.value)}
                    onFocus={handleNameFocus}
                    onBlur={handleNameBlur}
                  />
                  {showSuggestions && hasAnySuggestions && (
                    <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-md border border-border bg-popover shadow-md">
                      {catalogueSuggestions.map((drug) => (
                        <button
                          key={`catalogue-${drug.id}`}
                          type="button"
                          className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm hover:bg-muted focus:bg-muted focus:outline-none"
                          onMouseDown={(e) => e.preventDefault()} // keep input focus so onBlur's timeout doesn't race this click
                          onClick={() => selectDrug(drug)}
                        >
                          <span className="font-medium text-foreground">{drugDisplayLabel(drug)}</span>
                          <span className="text-xs text-muted-foreground">{drugSubLabel(drug)}</span>
                        </button>
                      ))}
                      {pastNameSuggestions.length > 0 && (
                        <>
                          {catalogueSuggestions.length > 0 && (
                            <div className="border-t border-border" />
                          )}
                          {pastNameSuggestions.map((name) => (
                            <button
                              key={`past-${name}`}
                              type="button"
                              className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm hover:bg-muted focus:bg-muted focus:outline-none"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => selectPastName(name)}
                            >
                              <span className="font-medium text-foreground">{name}</span>
                              <span className="text-xs text-muted-foreground">Previously prescribed</span>
                            </button>
                          ))}
                        </>
                      )}
                    </div>
                  )}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="shrink-0"
                  onClick={() => setPickerOpen(true)}
                  aria-label="Select from inventory"
                  title="Select from inventory"
                >
                  <ListFilter className="h-4 w-4" />
                </Button>
              </div>
              {form.drugId && (
                <p className="text-xs text-emerald-600 dark:text-emerald-400">Matched to pharmacy catalogue</p>
              )}
              {!drugsLoaded && (
                <p className="text-xs text-muted-foreground">Loading catalogue…</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pv-med-dosage">Dosage</Label>
                <Input
                  id="pv-med-dosage"
                  placeholder="e.g. 500 mg"
                  value={form.dosage}
                  onChange={(e) => setForm({ ...form, dosage: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pv-med-freq">Frequency</Label>
                <Select
                  value={form.frequency}
                  onValueChange={(v) => setForm({ ...form, frequency: v })}
                >
                  <SelectTrigger id="pv-med-freq">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {FREQUENCY_OPTIONS.map((opt) => (
                      <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pv-med-dur">Duration</Label>
                <Input
                  id="pv-med-dur"
                  placeholder="e.g. 7 days"
                  value={form.duration}
                  onChange={(e) => setForm({ ...form, duration: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pv-med-instr">Instructions</Label>
                <Input
                  id="pv-med-instr"
                  placeholder="e.g. Take with food"
                  value={form.instructions}
                  onChange={(e) => setForm({ ...form, instructions: e.target.value })}
                />
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <Button size="sm" onClick={handleAdd} className="flex-1">Add</Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => { setForm(emptyForm); setShowForm(false) }}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Select-from-inventory picker */}
      <Dialog open={pickerOpen} onOpenChange={(open) => { setPickerOpen(open); if (!open) setPickerSearch('') }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Select medicine</DialogTitle>
            <DialogDescription>Browse the clinic&apos;s pharmacy catalogue.</DialogDescription>
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
            {!drugsLoaded ? (
              <p className="p-4 text-center text-sm text-muted-foreground">Loading…</p>
            ) : pickerResults.length === 0 ? (
              <p className="p-4 text-center text-sm text-muted-foreground">
                {drugs.length === 0 ? 'No medicines in the catalogue yet.' : 'No medicines match your search.'}
              </p>
            ) : (
              pickerResults.map((drug) => (
                <button
                  key={drug.id}
                  type="button"
                  className="flex w-full flex-col items-start gap-0.5 border-b border-border px-3 py-2 text-left text-sm last:border-b-0 hover:bg-muted focus:bg-muted focus:outline-none"
                  onClick={() => selectFromPicker(drug)}
                >
                  <span className="font-medium text-foreground">{drugDisplayLabel(drug)}</span>
                  <span className="text-xs text-muted-foreground">{drugSubLabel(drug)}</span>
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}