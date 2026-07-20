// src/features/post-visit/components/EncounterCard.tsx
//
// Card 3 of 5. Always controlled.
// Key corrections from v0:
//   - Status values: active / resolved / chronic  (not Active/Provisional/Resolved)
//   - conditionName (not name); observations (not vitals)
//   - severity field added (mild / moderate / severe)
//   - No hardcoded sample data
//   - "Custom…" option for observation types the preset list doesn't cover

'use client'

import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import type {
  EncounterData,
  DiagnosisLine,
  ObservationLine,
  DiagnosisSeverity,
  DiagnosisStatus,
} from '../types'

interface EncounterCardProps {
  value:    EncounterData
  onChange: (data: EncounterData) => void
}

const OBSERVATION_TYPES = [
  'Blood Pressure',
  'Heart Rate',
  'Temperature',
  'SpO2',
  'Respiratory Rate',
  'Weight',
  'Height',
  'Blood Glucose',
  'BMI',
]

// Patch top-level encounter fields without touching children
type EncounterPatch = Partial<Pick<EncounterData, 'chiefComplaint' | 'notes' | 'diagnoses' | 'observations'>>

const EMPTY_DIAG_FORM = {
  conditionName: '',
  severity:      undefined as string | undefined,
  status:        'active' as DiagnosisStatus,
  notes:         '',
}

const EMPTY_OBS_FORM = {
  observationType: '',
  customType:      '',
  value:           '',
  unit:            '',
}

export default function EncounterCard({ value, onChange }: EncounterCardProps) {
  const [showDiagForm, setShowDiagForm] = useState(false)
  const [showObsForm,  setShowObsForm]  = useState(false)
  const [diagForm, setDiagForm]         = useState(EMPTY_DIAG_FORM)
  const [obsForm,  setObsForm]          = useState(EMPTY_OBS_FORM)

  const patch = (p: EncounterPatch) => onChange({ ...value, ...p })

  // ── Diagnosis handlers ───────────────────────────────────────────────────

  const handleAddDiagnosis = () => {
    if (!diagForm.conditionName.trim()) return
    const newDiag: DiagnosisLine = {
      localId:       crypto.randomUUID(),
      conditionName: diagForm.conditionName.trim(),
      severity:      diagForm.severity as DiagnosisSeverity | undefined,
      status:        diagForm.status,
      notes:         diagForm.notes.trim() || undefined,
    }
    patch({ diagnoses: [...value.diagnoses, newDiag] })
    setDiagForm(EMPTY_DIAG_FORM)
    setShowDiagForm(false)
  }

  const handleRemoveDiagnosis = (localId: string) =>
    patch({ diagnoses: value.diagnoses.filter((d) => d.localId !== localId) })

  // ── Observation handlers ─────────────────────────────────────────────────

  const handleAddObservation = () => {
    const type =
      obsForm.observationType === '__custom__'
        ? obsForm.customType.trim()
        : obsForm.observationType
    if (!type || !obsForm.value.trim()) return

    const newObs: ObservationLine = {
      localId:         crypto.randomUUID(),
      observationType: type,
      value:           obsForm.value.trim(),
      unit:            obsForm.unit.trim() || undefined,
    }
    patch({ observations: [...value.observations, newObs] })
    setObsForm(EMPTY_OBS_FORM)
    setShowObsForm(false)
  }

  const handleRemoveObservation = (localId: string) =>
    patch({ observations: value.observations.filter((o) => o.localId !== localId) })

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-foreground">Encounter</h2>
        <p className="text-sm text-muted-foreground">Consultation notes for this visit</p>
      </div>

      {/* Chief complaint */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="pv-cc">Chief complaint</Label>
        <Input
          id="pv-cc"
          placeholder="e.g. Chest pain for 2 days"
          value={value.chiefComplaint ?? ''}
          onChange={(e) => patch({ chiefComplaint: e.target.value || undefined })}
        />
      </div>

      {/* Clinical notes */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="pv-notes">Clinical notes</Label>
        <Textarea
          id="pv-notes"
          placeholder="Findings, examination notes, plan…"
          rows={4}
          value={value.notes ?? ''}
          onChange={(e) => patch({ notes: e.target.value || undefined })}
        />
      </div>

      {/* ── Diagnoses ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3">
        <Label>Diagnoses</Label>

        {value.diagnoses.length > 0 && (
          <div className="flex flex-col gap-2">
            {value.diagnoses.map((d) => (
              <div
                key={d.localId}
                className="flex items-center gap-3 rounded-lg border border-border px-3 py-2"
              >
                <div className="flex flex-1 flex-col gap-0.5">
                  <p className="text-sm font-medium text-foreground">{d.conditionName}</p>
                  <p className="text-xs capitalize text-muted-foreground">
                    {[d.status, d.severity].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  onClick={() => handleRemoveDiagnosis(d.localId)}
                  aria-label={`Remove ${d.conditionName}`}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {showDiagForm ? (
          <div className="rounded-lg border border-border bg-muted/20 p-4">
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pv-diag-name">
                  Condition <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="pv-diag-name"
                  placeholder="e.g. Type 2 Diabetes"
                  value={diagForm.conditionName}
                  onChange={(e) => setDiagForm({ ...diagForm, conditionName: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label>Status</Label>
                  <Select
                    value={diagForm.status}
                    onValueChange={(v) =>
                      setDiagForm({ ...diagForm, status: v as DiagnosisStatus })
                    }
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="chronic">Chronic</SelectItem>
                      <SelectItem value="resolved">Resolved</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label>Severity</Label>
                  <Select
                    value={diagForm.severity ?? ''}
                    onValueChange={(v) =>
                      setDiagForm({ ...diagForm, severity: v || undefined })
                    }
                  >
                    <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mild">Mild</SelectItem>
                      <SelectItem value="moderate">Moderate</SelectItem>
                      <SelectItem value="severe">Severe</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pv-diag-notes">Notes</Label>
                <Input
                  id="pv-diag-notes"
                  placeholder="Optional notes"
                  value={diagForm.notes}
                  onChange={(e) => setDiagForm({ ...diagForm, notes: e.target.value })}
                />
              </div>

              <div className="flex gap-2">
                <Button size="sm" onClick={handleAddDiagnosis} className="flex-1">Add</Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => { setDiagForm(EMPTY_DIAG_FORM); setShowDiagForm(false) }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="w-fit text-primary hover:text-primary/90"
            onClick={() => setShowDiagForm(true)}
          >
            <Plus className="mr-1 h-4 w-4" />
            Add diagnosis
          </Button>
        )}
      </div>

      {/* ── Observations / Vitals ──────────────────────────────────────────── */}
      <div className="flex flex-col gap-3">
        <Label>Vitals &amp; observations</Label>

        {value.observations.length > 0 && (
          <div className="flex flex-col gap-2">
            {value.observations.map((obs) => (
              <div
                key={obs.localId}
                className="flex items-center gap-3 rounded-lg border border-border px-3 py-2"
              >
                <div className="flex flex-1 flex-col gap-0.5">
                  <p className="text-xs text-muted-foreground">{obs.observationType}</p>
                  <p className="text-sm font-medium text-foreground">
                    {obs.value}
                    {obs.unit && (
                      <span className="ml-1 text-xs font-normal text-muted-foreground">
                        {obs.unit}
                      </span>
                    )}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  onClick={() => handleRemoveObservation(obs.localId)}
                  aria-label={`Remove ${obs.observationType}`}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {showObsForm ? (
          <div className="rounded-lg border border-border bg-muted/20 p-4">
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>
                  Type <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={obsForm.observationType}
                  onValueChange={(v) =>
                    setObsForm({ ...obsForm, observationType: v, customType: '' })
                  }
                >
                  <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>
                    {OBSERVATION_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                    <SelectItem value="__custom__">Custom…</SelectItem>
                  </SelectContent>
                </Select>
                {obsForm.observationType === '__custom__' && (
                  <Input
                    placeholder="Enter observation type"
                    value={obsForm.customType}
                    onChange={(e) => setObsForm({ ...obsForm, customType: e.target.value })}
                    className="mt-1.5"
                  />
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="pv-obs-val">
                    Value <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="pv-obs-val"
                    placeholder="e.g. 120/80"
                    value={obsForm.value}
                    onChange={(e) => setObsForm({ ...obsForm, value: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="pv-obs-unit">Unit</Label>
                  <Input
                    id="pv-obs-unit"
                    placeholder="e.g. mmHg"
                    value={obsForm.unit}
                    onChange={(e) => setObsForm({ ...obsForm, unit: e.target.value })}
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <Button size="sm" onClick={handleAddObservation} className="flex-1">Add</Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => { setObsForm(EMPTY_OBS_FORM); setShowObsForm(false) }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="w-fit text-primary hover:text-primary/90"
            onClick={() => setShowObsForm(true)}
          >
            <Plus className="mr-1 h-4 w-4" />
            Add vital / observation
          </Button>
        )}
      </div>
    </div>
  )
}