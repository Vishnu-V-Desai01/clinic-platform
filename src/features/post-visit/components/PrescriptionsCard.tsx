// src/features/post-visit/components/PrescriptionsCard.tsx
//
// Card 1 of 5 in the Post-Visit wizard.
// Always controlled — wizard shell owns all state.
// Soft-deletes via isDeleted:true so the server can:
//   - call deleteMedicine() on removed care-plan rows (carePlanMedicineId set)
//   - skip newly-added rows that the doctor removed (no carePlanMedicineId)
// No hardcoded data. Pre-fill comes from the wizard's initial state (seeded
// by getVisitPrefill which reads care_plan_medicines).

'use client'

import { useState } from 'react'
import { Pill, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
  dosage:       '',
  frequency:    '',
  duration:     '',
  instructions: '',
}

export default function PrescriptionsCard({ value, onChange }: PrescriptionsCardProps) {
  const [showForm, setShowForm] = useState(false)
  const [form, setForm]         = useState(emptyForm)

  // Visible = not soft-deleted
  const visibleLines = value.filter((rx) => !rx.isDeleted)

  // Always soft-delete: keeps the row so completeVisit can decide whether
  // to call deleteMedicine() (carePlanMedicineId set) or just ignore it.
  const handleRemove = (localId: string) =>
    onChange(value.map((rx) => rx.localId === localId ? { ...rx, isDeleted: true } : rx))

  const handleAdd = () => {
    if (!form.medicineName.trim()) return
    const newLine: PrescriptionLine = {
      localId:      crypto.randomUUID(),
      medicineName: form.medicineName.trim(),
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
                {rx.carePlanMedicineId && (
                  <span className="text-xs text-muted-foreground/50">from care plan</span>
                )}
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
              <Input
                id="pv-med-name"
                placeholder="e.g. Lisinopril"
                value={form.medicineName}
                onChange={(e) => setForm({ ...form, medicineName: e.target.value })}
              />
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
    </div>
  )
}