'use client'

import { useState } from 'react'
import { Check, Loader2 } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

interface FamilyCard {
  id: string
  firstName: string
  lastName: string
  clinicName: string
  doctorName?: string | null
}

interface PatientAppointmentRequestFormProps {
  familyCards: FamilyCard[]
  onSubmit: (
    patientId: string,
    preferredDate: string,
    preferredTimeSlot?: string,
    reason?: string,
  ) => Promise<void>
}

export default function PatientAppointmentRequestForm({
  familyCards,
  onSubmit,
}: PatientAppointmentRequestFormProps) {
  const [selectedClinic, setSelectedClinic] = useState<string>('')
  const [preferredDate, setPreferredDate] = useState<string>('')
  const [preferredTimeSlot, setPreferredTimeSlot] = useState<string>('')
  const [reason, setReason] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const today = new Date().toISOString().split('T')[0]

  const isFormValid = selectedClinic && preferredDate

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isFormValid) return

    setLoading(true)
    setError(null)

    try {
      await onSubmit(
        selectedClinic,
        preferredDate,
        preferredTimeSlot || undefined,
        reason || undefined,
      )
      setSuccess(true)
      setSelectedClinic('')
      setPreferredDate('')
      setPreferredTimeSlot('')
      setReason('')
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to submit appointment request'
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmitAnother = () => {
    setSuccess(false)
    setError(null)
  }

  if (success) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6">
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15">
            <Check className="h-8 w-8 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-2">Request Submitted!</h2>
          <p className="text-muted-foreground mb-6 max-w-xs">
            Your appointment request has been sent to your clinic. They&apos;ll confirm the
            appointment or suggest an alternative time.
          </p>
          <Button onClick={handleSubmitAnother} variant="secondary">
            Submit Another Request
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground sm:text-3xl">
          Request an Appointment
        </h1>
        <p className="mt-2 text-lg text-muted-foreground">
          Ask your doctor for an appointment slot
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Your request will be sent to your clinic. They&apos;ll confirm the appointment or
          suggest an alternative time.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-2">
          <label htmlFor="clinic-select" className="text-sm font-semibold text-foreground">
            Which clinic would you like to book at?
          </label>
          <Select value={selectedClinic} onValueChange={setSelectedClinic}>
            <SelectTrigger id="clinic-select" aria-required="true">
              <SelectValue placeholder="Select a clinic..." />
            </SelectTrigger>
            <SelectContent>
              {familyCards.map((card) => (
                <SelectItem key={card.id} value={card.id}>
                  {card.clinicName} — Dr. {card.doctorName ?? 'Unassigned'} — {card.firstName}{' '}
                  {card.lastName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground italic">
            Shows the clinic, your assigned doctor, and the patient for each of your cards
          </p>
        </div>

        <div className="space-y-2">
          <label htmlFor="preferred-date" className="text-sm font-semibold text-foreground">
            Preferred Date
          </label>
          <input
            id="preferred-date"
            type="date"
            min={today}
            value={preferredDate}
            onChange={(e) => setPreferredDate(e.target.value)}
            required
            aria-required="true"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          />
          <p className="text-xs text-muted-foreground italic">
            Select a date from today onwards
          </p>
        </div>

        <div className="space-y-3">
          <label className="text-sm font-semibold text-foreground">Preferred Time</label>
          <div className="flex flex-col gap-2 sm:flex-row">
            {(['morning', 'afternoon', 'evening'] as const).map((slot) => (
              <label
                key={slot}
                className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 cursor-pointer hover:bg-muted has-[:checked]:border-primary has-[:checked]:bg-primary/10"
              >
                <input
                  type="radio"
                  name="time-slot"
                  value={slot}
                  checked={preferredTimeSlot === slot}
                  onChange={(e) => setPreferredTimeSlot(e.target.value)}
                  className="h-4 w-4 cursor-pointer"
                />
                <span className="text-sm font-medium capitalize">{slot}</span>
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground italic">Optional</p>
        </div>

        <div className="space-y-2">
          <label htmlFor="reason" className="text-sm font-semibold text-foreground">
            Why do you need this appointment?
          </label>
          <textarea
            id="reason"
            placeholder="e.g., Follow-up consultation, routine checkup, specific concern"
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 resize-none h-24"
            aria-label="Appointment reason or notes"
          />
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground italic">Optional</p>
            <p className="text-xs text-muted-foreground">{reason.length}/500</p>
          </div>
        </div>

        {error && (
          <Card className="border-destructive/20 bg-destructive/10 p-4">
            <p className="text-sm text-destructive" role="alert" aria-live="polite">
              {error}
            </p>
          </Card>
        )}

        <Button
          type="submit"
          disabled={!isFormValid || loading}
          className="w-full sm:w-auto"
          aria-disabled={!isFormValid || loading}
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              Submitting…
            </>
          ) : (
            'Submit Request'
          )}
        </Button>
      </form>
    </div>
  )
}