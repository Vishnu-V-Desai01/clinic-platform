"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { AlertCircle, ArrowLeft, Plus, Trash2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"

import {
  COMMON_OBSERVATION_TYPES,
  DIAGNOSIS_SEVERITY_LABELS,
  DIAGNOSIS_STATUS_LABELS,
  PRESCRIPTION_STATUS_LABELS,
  type DiagnosisSeverity,
  type DiagnosisStatus,
  type PrescriptionStatus,
} from "../types"
import { createEncounter } from "../actions"
import AddDiagnosisDialog,    { type DiagnosisFormItem    } from "./AddDiagnosisDialog"
import AddObservationDialog,  { type ObservationFormItem  } from "./AddObservationDialog"
import AddPrescriptionDialog, { type PrescriptionFormItem } from "./AddPrescriptionDialog"

function obsTypeLabel(type: string): string {
  const found = COMMON_OBSERVATION_TYPES.find((t) => t.value === type)
  return found?.label ?? type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

interface NewEncounterFormClientProps {
  patientId:   string
  patientName: string
  patientMrn:  string
}

export default function NewEncounterFormClient({
  patientId,
  patientName,
  patientMrn,
}: NewEncounterFormClientProps) {
  const router                        = useRouter()
  const [isPending, startTransition]  = useTransition()
  const [formError, setFormError]     = useState<string | null>(null)

  const [encounterDate,   setEncounterDate]   = useState(
    new Date().toISOString().split("T")[0],
  )
  const [chiefComplaint, setChiefComplaint] = useState("")
  const [notes,          setNotes]          = useState("")

  const [diagnoses,     setDiagnoses]     = useState<DiagnosisFormItem[]>([])
  const [observations,  setObservations]  = useState<ObservationFormItem[]>([])
  const [prescriptions, setPrescriptions] = useState<PrescriptionFormItem[]>([])

  const [dxOpen,  setDxOpen]  = useState(false)
  const [obsOpen, setObsOpen] = useState(false)
  const [rxOpen,  setRxOpen]  = useState(false)

  function handleSubmit() {
    setFormError(null)
    startTransition(async () => {
      const result = await createEncounter(patientId, {
        encounter_date:  encounterDate,
        chief_complaint: chiefComplaint.trim() || null,
        notes:           notes.trim() || null,
        diagnoses: diagnoses.map((d) => ({
          condition_name: d.condition_name,
          code:           d.code || null,
          code_system:    d.code ? "ICD-10" : null,
          severity:       (d.severity || null) as DiagnosisSeverity | null,
          status:         d.status as DiagnosisStatus,
          notes:          d.notes || null,
        })),
        observations: observations.map((o) => ({
          observation_type: o.observation_type,
          value:            o.value,
          unit:             o.unit || null,
          code:             o.code || null,
          code_system:      o.code ? "LOINC" : null,
          notes:            null,
        })),
        prescriptions: prescriptions.map((p) => ({
          medicine_name: p.medicine_name,
          dosage:        p.dosage || null,
          frequency:     p.frequency || null,
          duration:      p.duration || null,
          instructions:  p.instructions || null,
          status:        p.status as PrescriptionStatus,
        })),
      })

      if ("error" in result) {
        setFormError(result.error)
      } else {
        router.push(`/patients/${patientId}/records/${result.encounterId}`)
      }
    })
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">

      {/* ── Scrollable content ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-5xl px-4 pt-6 pb-4">

          {/* Page header */}
          <div className="mb-6 flex items-start gap-3">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="mt-1 shrink-0"
              aria-label="Go back"
              disabled={isPending}
              onClick={() => router.push(`/patients/${patientId}/records`)}
            >
              <ArrowLeft className="size-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                New Encounter
              </h1>
              <p className="text-sm text-muted-foreground">
                {patientName} · {patientMrn}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-4">

            {/* ── Consultation Notes ── */}
            <Card>
              <Accordion type="single" collapsible defaultValue="notes">
                <AccordionItem value="notes" className="border-b-0">
                  <AccordionTrigger className="px-6 py-4 hover:no-underline">
                    <CardTitle className="text-base font-medium">
                      Consultation Notes
                    </CardTitle>
                  </AccordionTrigger>
                  <AccordionContent className="px-6 pb-6">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="encounter-date">Encounter Date</Label>
                        <Input
                          id="encounter-date"
                          type="date"
                          value={encounterDate}
                          onChange={(e) => setEncounterDate(e.target.value)}
                        />
                      </div>
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="chief-complaint">Chief Complaint</Label>
                        <Input
                          id="chief-complaint"
                          value={chiefComplaint}
                          placeholder="Primary reason for visit"
                          onChange={(e) => setChiefComplaint(e.target.value)}
                        />
                      </div>
                      <div className="flex flex-col gap-2 md:col-span-2">
                        <Label htmlFor="clinical-notes">Clinical Notes</Label>
                        <Textarea
                          id="clinical-notes"
                          value={notes}
                          rows={3}
                          placeholder="Observations, history, and assessment"
                          onChange={(e) => setNotes(e.target.value)}
                        />
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </Card>

            {/* ── 3-column clinical sections ── */}
            {/* Each card: "Add" button always at top, items grow below */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">

              {/* Diagnoses */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-medium">
                      Diagnoses
                    </CardTitle>
                    {diagnoses.length > 0 && (
                      <Badge variant="secondary">{diagnoses.length}</Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-2">

                  {/* ↓ button always first — never moves */}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => setDxOpen(true)}
                  >
                    <Plus className="mr-2 size-4" />
                    Add Diagnosis
                  </Button>

                  {diagnoses.map((dx, i) => (
                    <div
                      key={i}
                      className="flex items-start justify-between gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium leading-snug text-foreground">
                          {dx.condition_name}
                        </p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {dx.severity && (
                            <Badge variant="outline" className="px-1.5 py-0 text-xs">
                              {DIAGNOSIS_SEVERITY_LABELS[dx.severity as DiagnosisSeverity]}
                            </Badge>
                          )}
                          <Badge variant="outline" className="px-1.5 py-0 text-xs">
                            {DIAGNOSIS_STATUS_LABELS[dx.status as DiagnosisStatus]}
                          </Badge>
                        </div>
                        {dx.code && (
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            ICD-10: {dx.code}
                          </p>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-6 shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() =>
                          setDiagnoses((rows) => rows.filter((_, j) => j !== i))
                        }
                        aria-label={`Remove diagnosis ${i + 1}`}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Vitals / Observations */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-medium">
                      Vitals
                    </CardTitle>
                    {observations.length > 0 && (
                      <Badge variant="secondary">{observations.length}</Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-2">

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => setObsOpen(true)}
                  >
                    <Plus className="mr-2 size-4" />
                    Add Vital
                  </Button>

                  {observations.map((obs, i) => (
                    <div
                      key={i}
                      className="flex items-start justify-between gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium leading-snug text-foreground">
                          {obsTypeLabel(obs.observation_type)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {obs.value}
                          {obs.unit ? ` ${obs.unit}` : ""}
                        </p>
                        {obs.code && (
                          <p className="text-xs text-muted-foreground">
                            LOINC: {obs.code}
                          </p>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-6 shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() =>
                          setObservations((rows) => rows.filter((_, j) => j !== i))
                        }
                        aria-label={`Remove observation ${i + 1}`}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Prescriptions */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-medium">
                      Prescriptions
                    </CardTitle>
                    {prescriptions.length > 0 && (
                      <Badge variant="secondary">{prescriptions.length}</Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-2">

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => setRxOpen(true)}
                  >
                    <Plus className="mr-2 size-4" />
                    Add Prescription
                  </Button>

                  {prescriptions.map((rx, i) => (
                    <div
                      key={i}
                      className="flex items-start justify-between gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium leading-snug text-foreground">
                          {rx.medicine_name}
                          {rx.dosage ? ` · ${rx.dosage}` : ""}
                        </p>
                        {(rx.frequency || rx.duration) && (
                          <p className="text-xs text-muted-foreground">
                            {[rx.frequency, rx.duration]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        )}
                        <Badge
                          variant="outline"
                          className="mt-1 px-1.5 py-0 text-xs"
                        >
                          {PRESCRIPTION_STATUS_LABELS[rx.status as PrescriptionStatus]}
                        </Badge>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-6 shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() =>
                          setPrescriptions((rows) => rows.filter((_, j) => j !== i))
                        }
                        aria-label={`Remove prescription ${i + 1}`}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>

            </div>
          </div>
        </div>
      </div>

      {/* ── Dialogs ── */}
      <AddDiagnosisDialog
        open={dxOpen}
        onClose={() => setDxOpen(false)}
        onAdd={(item) => {
          setDiagnoses((prev) => [...prev, item])
          setDxOpen(false)
        }}
      />
      <AddObservationDialog
        open={obsOpen}
        onClose={() => setObsOpen(false)}
        onAdd={(item) => {
          setObservations((prev) => [...prev, item])
          setObsOpen(false)
        }}
      />
      <AddPrescriptionDialog
        open={rxOpen}
        onClose={() => setRxOpen(false)}
        onAdd={(item) => {
          setPrescriptions((prev) => [...prev, item])
          setRxOpen(false)
        }}
      />

      {/* ── Footer — shrink-0 always visible ── */}
      <div className="shrink-0 -mx-4 md:-mx-6 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          {formError ? (
            <p className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="size-4 shrink-0" />
              {formError}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Saving creates the encounter and all its records together.
            </p>
          )}
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => router.push(`/patients/${patientId}/records`)}
            >
              Cancel
            </Button>
            <Button type="button" disabled={isPending} onClick={handleSubmit}>
              {isPending ? "Saving…" : "Save Encounter"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}