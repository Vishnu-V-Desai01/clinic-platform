"use client"

import * as React from "react"
import { useTransition } from "react"
import { AlertTriangle } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

import { cancelAppointment } from "../actions"

const REASON_OPTIONS = [
  { value: "patient_request",       label: "Patient request" },
  { value: "doctor_unavailable",    label: "Doctor unavailable" },
  { value: "rescheduled_elsewhere", label: "Rescheduled elsewhere" },
  { value: "other",                 label: "Other" },
] as const

interface CancelDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  appointmentId: string
  patientName: string
  /** ISO string — used for the confirmation message only */
  appointmentDateTime: string
  onSuccess: () => void
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
  } catch {
    return iso
  }
}

export default function CancelDialog({
  open,
  onOpenChange,
  appointmentId,
  patientName,
  appointmentDateTime,
  onSuccess,
}: CancelDialogProps) {
  const [reason, setReason] = React.useState("")
  const [note, setNote]     = React.useState("")
  const [error, setError]   = React.useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Reset form whenever the dialog closes
  React.useEffect(() => {
    if (!open) {
      setReason("")
      setNote("")
      setError(null)
    }
  }, [open])

  function handleConfirm() {
    // Combine dropdown label + optional note into a single reason string
    const label    = REASON_OPTIONS.find((r) => r.value === reason)?.label
    const combined = [label, note.trim() || null].filter(Boolean).join(" — ") || undefined

    startTransition(async () => {
      const result = await cancelAppointment(appointmentId, { reason: combined })
      if (!result.success) {
        setError(result.error)
        return
      }
      onOpenChange(false)
      onSuccess()
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <span
              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive"
              aria-hidden="true"
            >
              <AlertTriangle className="size-5" />
            </span>
            <div className="space-y-1.5">
              <DialogTitle>Cancel this appointment?</DialogTitle>
              <DialogDescription>
                This will cancel{" "}
                <span className="font-medium text-foreground">{patientName}</span>
                {"'s"} appointment on{" "}
                <span className="font-medium text-foreground">
                  {formatDateTime(appointmentDateTime)}
                </span>
                .
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="cancel-reason">Reason (optional)</Label>
            <Select value={reason} onValueChange={setReason} disabled={isPending}>
              <SelectTrigger id="cancel-reason">
                <SelectValue placeholder="Select a reason" />
              </SelectTrigger>
              <SelectContent>
                {REASON_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="cancel-note">Additional note (optional)</Label>
            <Textarea
              id="cancel-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add a note…"
              disabled={isPending}
              rows={3}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Keep Appointment
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isPending}
            className="bg-destructive text-white hover:bg-destructive/90"
          >
            {isPending ? "Cancelling…" : "Cancel Appointment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}