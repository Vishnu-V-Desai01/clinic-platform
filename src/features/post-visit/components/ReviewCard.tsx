// src/features/post-visit/components/ReviewCard.tsx
//
// Card 5 of 5 (always shown, never skippable).
// Receives raw wizard state — never null props.
// Derives summaries from actual data; shows "Skipped" badge when a step
// is in skippedSteps[].
// onEditStep jumps the wizard back to the named step for corrections.
//
// Issue 5 additions: chargesLocked / chargesRequireApproval reflect the
// financial-integrity state in the charges section — a locked charge shows
// a "Locked" badge instead of an Edit button (nothing to edit), and a
// staff-proposed charge shows a "Needs approval" badge alongside its
// summary rather than looking identical to an auto-approved one.

'use client'

import { CheckCircle2, Lock } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { WIZARD_STEP_LABELS } from '../types'
import type {
  PrescriptionLine,
  MedicineReminderTime,
  EncounterData,
  ChargeLineItem,
  WizardStep,
} from '../types'

interface ReviewCardProps {
  prescriptions:           PrescriptionLine[]
  reminderTimes:           MedicineReminderTime[]
  encounter:               EncounterData
  charges:                 ChargeLineItem[]
  skippedSteps:            WizardStep[]
  onEditStep:              (step: WizardStep) => void
  chargesLocked?:          boolean
  chargesRequireApproval?: boolean
}

// ── Summary helpers ──────────────────────────────────────────────────────

const fmt = (rupees: number) =>
  `₹${rupees.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function rxSummary(lines: PrescriptionLine[]): string {
  const active = lines.filter((rx) => !rx.isDeleted)
  if (active.length === 0) return 'No medicines prescribed'
  const names   = active.map((rx) => rx.medicineName)
  const preview = names.slice(0, 3).join(', ')
  return active.length > 3
    ? `${active.length} medicines — ${preview} +${active.length - 3} more`
    : `${active.length} medicine${active.length > 1 ? 's' : ''} — ${preview}`
}

function reminderSummary(times: MedicineReminderTime[]): string {
  if (times.length === 0) return 'No reminders scheduled'
  const uniqueMedicines = new Set(times.map((t) => t.medicineName))
  const totalReminders = times.length
  return `${uniqueMedicines.size} medicine${uniqueMedicines.size > 1 ? 's' : ''} · ${totalReminders} reminder${totalReminders > 1 ? 's' : ''}`
}

function encSummary(enc: EncounterData): string {
  const activeDiagnoses    = enc.diagnoses.filter((d) => !d.isDeleted)
  const activeObservations = enc.observations.filter((o) => !o.isDeleted)
  const parts: string[] = []
  if (enc.chiefComplaint)          parts.push(enc.chiefComplaint)
  if (activeDiagnoses.length)      parts.push(`${activeDiagnoses.length} diagnosis${activeDiagnoses.length > 1 ? 'es' : ''}`)
  if (activeObservations.length)   parts.push(`${activeObservations.length} vital${activeObservations.length > 1 ? 's' : ''}`)
  return parts.length > 0 ? parts.join(' · ') : 'No clinical notes'
}

function chargeSummary(items: ChargeLineItem[]): string {
  if (items.length === 0) return 'No charges added'
  const total = items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0)
  return `${items.length} item${items.length > 1 ? 's' : ''} · ${fmt(total)}`
}

// ── Component ─────────────────────────────────────────────────────────────

type SectionDef = {
  step:    WizardStep
  summary: string
}

export default function ReviewCard({
  prescriptions,
  reminderTimes,
  encounter,
  charges,
  skippedSteps,
  onEditStep,
  chargesLocked,
  chargesRequireApproval,
}: ReviewCardProps) {
  const sections: SectionDef[] = [
    { step: 'prescriptions', summary: rxSummary(prescriptions) },
    { step: 'reminders',     summary: reminderSummary(reminderTimes) },
    { step: 'encounter',     summary: encSummary(encounter) },
    { step: 'charges',       summary: chargeSummary(charges) },
  ]

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Review</h2>
        <p className="text-sm text-muted-foreground">
          Confirm everything before completing the visit
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {sections.map(({ step, summary }) => {
          const isSkipped     = skippedSteps.includes(step)
          const isChargesStep = step === 'charges'

          return (
            <div
              key={step}
              className="flex items-start justify-between gap-4 rounded-lg border border-border bg-background/50 p-4"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex items-center gap-2">
                  {!isSkipped && (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
                  )}
                  <h3 className="text-sm font-medium text-foreground">
                    {WIZARD_STEP_LABELS[step]}
                  </h3>
                  {isChargesStep && chargesRequireApproval && !chargesLocked && (
                    <Badge
                      variant="secondary"
                      className="bg-primary/10 text-xs text-primary"
                    >
                      Needs approval
                    </Badge>
                  )}
                </div>
                {isSkipped ? (
                  <Badge
                    variant="secondary"
                    className="mt-0.5 w-fit bg-muted text-xs text-muted-foreground"
                  >
                    Skipped
                  </Badge>
                ) : (
                  <p className="mt-0.5 truncate text-sm text-muted-foreground">{summary}</p>
                )}
              </div>

              {isChargesStep && chargesLocked ? (
                <div className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                  <Lock className="h-3.5 w-3.5" />
                  Locked
                </div>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0 text-primary hover:bg-primary/10 hover:text-primary"
                  onClick={() => onEditStep(step)}
                >
                  Edit
                </Button>
              )}
            </div>
          )
        })}
      </div>

      {/* Confirmation note */}
      <div className="rounded-lg border border-border bg-primary/5 p-4">
        <p className="text-sm text-muted-foreground">
          Clicking{' '}
          <strong className="text-foreground">Complete Visit</strong> saves all
          entries and marks the appointment complete. Skipped steps create no
          records.
          {chargesRequireApproval && !chargesLocked && (
            <> Charges will be held for approval before they&apos;re finalized.</>
          )}
        </p>
      </div>
    </div>
  )
}