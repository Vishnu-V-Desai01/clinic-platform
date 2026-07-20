// src/features/post-visit/components/CompleteVisitModal.tsx

'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Check, CheckCircle2, Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { completeVisit, getVisitPrefill } from '../actions'
import { SKIPPABLE_STEPS, WIZARD_STEP_LABELS, WIZARD_STEPS } from '../types'
import type {
  CompleteVisitPayload,
  CompleteVisitResult,
  VisitPrefill,
  WizardState,
  WizardStep,
} from '../types'
import ChargesCard       from './ChargesCard'
import EncounterCard     from './EncounterCard'
import RemindersCard     from './RemindersCard'
import PrescriptionsCard from './PrescriptionsCard'
import ReviewCard        from './ReviewCard'

interface CompleteVisitModalProps {
  appointmentId: string
  patientName:   string
  open:          boolean
  onOpenChange:  (open: boolean) => void
  onComplete?:   () => void
}

function makeInitialState(
  appointmentId: string,
  prefill:       VisitPrefill,
): WizardState {
  return {
    appointmentId,
    patientId:   prefill.patientId,
    currentStep: WIZARD_STEPS[0],
    skipped:     [],
    prescriptions: prefill.prescriptions,
    reminderTimes: prefill.reminderTimes,
    encounter: {
      chiefComplaint: undefined,
      notes:          undefined,
      diagnoses:      [],
      observations:   [],
    },
    charges: prefill.defaultFee != null
      ? [{
          localId:     crypto.randomUUID(),
          description: 'Consultation fee',
          quantity:    1,
          unitPrice:   prefill.defaultFee,
        }]
      : [],
  }
}

function buildPayload(state: WizardState): CompleteVisitPayload {
  const { skipped } = state

  return {
    appointmentId: state.appointmentId,
    patientId:     state.patientId,

    prescriptions: skipped.includes('prescriptions')
      ? null
      : state.prescriptions.map((rx) => ({
          carePlanMedicineId: rx.carePlanMedicineId,
          medicineName:       rx.medicineName,
          dosage:             rx.dosage,
          frequency:          rx.frequency,
          duration:           rx.duration,
          instructions:       rx.instructions,
          mealAssociation:    rx.mealAssociation,
          mealTiming:         rx.mealTiming,
          status:             rx.status,
          isDeleted:          rx.isDeleted,
        })),

    reminderTimes: skipped.includes('reminders')
      ? null
      : state.reminderTimes.map((r) => ({
          medicineName:    r.medicineName,
          time:            r.time,
          duration:        r.duration,
          mealAssociation: r.mealAssociation,
        })),

    encounter: skipped.includes('encounter')
      ? null
      : {
          chiefComplaint: state.encounter.chiefComplaint,
          notes:          state.encounter.notes,
          diagnoses: state.encounter.diagnoses.map((d) => ({
            conditionName: d.conditionName,
            severity:      d.severity,
            status:        d.status,
            notes:         d.notes,
          })),
          observations: state.encounter.observations.map((o) => ({
            observationType: o.observationType,
            value:           o.value,
            unit:            o.unit,
            notes:           o.notes,
          })),
        },

    charges: skipped.includes('charges')
      ? null
      : state.charges.map((c) => ({
          description: c.description,
          quantity:    c.quantity,
          unitPrice:   c.unitPrice,
        })),
  }
}

const STEPPER_STEPS: WizardStep[] = [
  'prescriptions',
  'reminders',
  'encounter',
  'charges',
]

function Stepper({
  currentStep,
  skipped,
}: {
  currentStep: WizardStep
  skipped:     WizardStep[]
}) {
  const currentIdx = WIZARD_STEPS.indexOf(currentStep)
  const isReview   = currentStep === 'review'

  return (
    <div className="flex items-start px-8 pb-5 pt-4">
      {STEPPER_STEPS.map((step, idx) => {
        const stepIdx    = WIZARD_STEPS.indexOf(step)
        const isActive   = !isReview && currentStep === step
        const isComplete = isReview || stepIdx < currentIdx
        const isSkipped  = skipped.includes(step)

        return (
          <div key={step} className="flex flex-1 items-start">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-colors',
                  isActive   && 'bg-primary text-primary-foreground ring-2 ring-primary/20',
                  isComplete && !isActive && 'bg-primary text-primary-foreground',
                  !isActive  && !isComplete && 'bg-muted text-muted-foreground',
                )}
              >
                {isComplete && !isActive ? <Check className="h-3.5 w-3.5" /> : idx + 1}
              </div>
              <span
                className={cn(
                  'text-center text-[10px] font-medium leading-tight',
                  isActive                              && 'text-primary',
                  isComplete && !isActive && isSkipped  && 'text-muted-foreground line-through',
                  isComplete && !isActive && !isSkipped && 'text-foreground',
                  !isActive  && !isComplete             && 'text-muted-foreground',
                )}
              >
                {WIZARD_STEP_LABELS[step]}
              </span>
            </div>

            {idx < STEPPER_STEPS.length - 1 && (
              <div
                className={cn(
                  'mt-3.5 h-px flex-1 transition-colors',
                  isComplete ? 'bg-primary/40' : 'bg-border',
                )}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function CompleteVisitModal({
  appointmentId,
  patientName,
  open,
  onOpenChange,
  onComplete,
}: CompleteVisitModalProps) {

  const [wizardState,    setWizardState]    = useState<WizardState | null>(null)
  const [prefillLoading, setPrefillLoading] = useState(false)
  const [prefillError,   setPrefillError]   = useState<string | null>(null)
  const [isSaving,       setIsSaving]       = useState(false)
  const [saveResult,     setSaveResult]     = useState<CompleteVisitResult | null>(null)

  useEffect(() => {
    if (!open) return

    let aborted = false
    setWizardState(null)
    setSaveResult(null)
    setPrefillError(null)
    setPrefillLoading(true)

    getVisitPrefill(appointmentId).then((result) => {
      if (aborted) return
      setPrefillLoading(false)
      if (!result.success) {
        setPrefillError(result.error)
        return
      }
      setWizardState(makeInitialState(appointmentId, result.data))
    })

    return () => { aborted = true }
  }, [open, appointmentId])

  const patch = useCallback(
    (partial: Partial<WizardState>) =>
      setWizardState((prev) => prev ? { ...prev, ...partial } : prev),
    [],
  )

  const currentStep = wizardState?.currentStep ?? WIZARD_STEPS[0]
  const currentIdx  = WIZARD_STEPS.indexOf(currentStep)
  const isSkippable = SKIPPABLE_STEPS.includes(currentStep)
  const isReview    = currentStep === 'review'

  const goBack = () => {
    if (currentIdx > 0) patch({ currentStep: WIZARD_STEPS[currentIdx - 1] })
  }

  const goNext = () => {
    if (currentIdx < WIZARD_STEPS.length - 1)
      patch({ currentStep: WIZARD_STEPS[currentIdx + 1] })
  }

  const skipStep = () => {
    if (!wizardState) return
    const newSkipped = wizardState.skipped.includes(currentStep)
      ? wizardState.skipped
      : [...wizardState.skipped, currentStep]
    const nextStep = currentIdx < WIZARD_STEPS.length - 1
      ? WIZARD_STEPS[currentIdx + 1]
      : currentStep
    setWizardState({ ...wizardState, skipped: newSkipped, currentStep: nextStep })
  }

  const handleCompleteVisit = async () => {
    if (!wizardState || isSaving) return
    setIsSaving(true)
    const result = await completeVisit(buildPayload(wizardState))
    setIsSaving(false)

    if (result.success && !(result.warnings?.length)) {
      onOpenChange(false)
      onComplete?.()
      return
    }
    setSaveResult(result)
  }

  const handleClose = () => {
    if (isSaving) return
    const wasSuccess = saveResult?.success === true
    setSaveResult(null)
    onOpenChange(false)
    if (wasSuccess) onComplete?.()
  }

  const showWizard    = !!wizardState && !prefillLoading && saveResult === null
  const showWarnState = saveResult !== null && saveResult.success === true && (saveResult.warnings?.length ?? 0) > 0
  const showErrState  = saveResult !== null && saveResult.success === false

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose() }}>
      <DialogContent
        className="flex max-h-[90vh] max-w-4xl flex-col gap-0 p-0"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e)   => { if (isSaving) e.preventDefault() }}
      >
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle className="text-base font-semibold leading-none">
            Complete Visit
            <span className="ml-1.5 font-normal text-muted-foreground">
              — {patientName}
            </span>
          </DialogTitle>
          <DialogDescription className="sr-only">
            Record prescriptions, encounter notes, and charges for this visit,
            then mark it complete.
          </DialogDescription>
        </DialogHeader>

        {prefillLoading && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-24">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Loading visit data…</p>
          </div>
        )}

        {!prefillLoading && prefillError !== null && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 py-20 text-center">
            <AlertTriangle className="h-10 w-10 text-destructive" />
            <div>
              <p className="font-medium text-foreground">Could not load visit data</p>
              <p className="mt-1 text-sm text-muted-foreground">{prefillError}</p>
            </div>
            <Button variant="outline" onClick={handleClose}>Close</Button>
          </div>
        )}

        {showWarnState && saveResult !== null && saveResult.success && (
          <div className="flex flex-1 flex-col gap-4 px-6 py-8">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-6 w-6 shrink-0 text-primary" />
              <p className="font-semibold text-foreground">Visit completed</p>
            </div>

            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
              <p className="mb-2 text-sm font-medium text-amber-600 dark:text-amber-400">
                Some items could not be saved:
              </p>
              <ul className="space-y-1">
                {(saveResult.warnings ?? []).map((w, i) => (
                  <li key={i} className="text-sm text-muted-foreground">• {w}</li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-muted-foreground">
                You can fill in the missing details from the patient&apos;s profile.
              </p>
            </div>

            <Button className="w-fit" onClick={handleClose}>Close</Button>
          </div>
        )}

        {showErrState && saveResult !== null && !saveResult.success && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 py-16 text-center">
            <AlertTriangle className="h-10 w-10 text-destructive" />
            <div>
              <p className="font-medium text-foreground">Could not save visit</p>
              <p className="mt-1 text-sm text-muted-foreground">{saveResult.error}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setSaveResult(null)}>
                Back to form
              </Button>
              <Button variant="ghost" onClick={handleClose}>
                Close without saving
              </Button>
            </div>
          </div>
        )}

        {showWizard && wizardState !== null && (
          <>
            <div className="border-b border-border">
              <Stepper currentStep={currentStep} skipped={wizardState.skipped} />
            </div>

            <div className="relative flex-1 overflow-y-auto">
              {isSaving && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-background/80 backdrop-blur-sm">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-sm font-medium text-muted-foreground">
                    Saving visit…
                  </p>
                </div>
              )}

              <div className="p-6">
                {currentStep === 'prescriptions' && (
                  <PrescriptionsCard
                    value={wizardState.prescriptions}
                    onChange={(lines) => patch({ prescriptions: lines })}
                  />
                )}
                {currentStep === 'reminders' && (
                  <RemindersCard
                    prescriptions={wizardState.prescriptions}
                    reminderTimes={wizardState.reminderTimes}
                    onReminderTimesChange={(times) => patch({ reminderTimes: times })}
                  />
                )}
                {currentStep === 'encounter' && (
                  <EncounterCard
                    value={wizardState.encounter}
                    onChange={(enc) => patch({ encounter: enc })}
                  />
                )}
                {currentStep === 'charges' && (
                  <ChargesCard
                    value={wizardState.charges}
                    onChange={(items) => patch({ charges: items })}
                  />
                )}
                {currentStep === 'review' && (
                  <ReviewCard
                    prescriptions={wizardState.prescriptions}
                    reminderTimes={wizardState.reminderTimes}
                    encounter={wizardState.encounter}
                    charges={wizardState.charges}
                    skippedSteps={wizardState.skipped}
                    onEditStep={(step) => patch({ currentStep: step })}
                  />
                )}
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-border px-6 py-4">
              <Button
                variant="outline"
                size="sm"
                onClick={goBack}
                disabled={currentIdx === 0 || isSaving}
              >
                ← Back
              </Button>

              {isSkippable ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={skipStep}
                  disabled={isSaving}
                  className="text-muted-foreground hover:text-foreground"
                >
                  Skip
                </Button>
              ) : (
                <span />
              )}

              <div className="flex items-center gap-2">
                {isReview ? (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleCompleteVisit}
                      disabled={isSaving}
                      className="text-muted-foreground"
                    >
                      {isSaving && (
                        <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                      )}
                      Skip &amp; Complete
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleCompleteVisit}
                      disabled={isSaving}
                    >
                      {isSaving && (
                        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                      )}
                      Complete Visit
                    </Button>
                  </>
                ) : (
                  <Button size="sm" onClick={goNext} disabled={isSaving}>
                    Next →
                  </Button>
                )}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}