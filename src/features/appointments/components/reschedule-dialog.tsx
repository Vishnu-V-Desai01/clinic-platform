"use client"

import * as React from "react"
import { useTransition } from "react"
import { Calendar, Clock } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import { rescheduleAppointment } from "../actions"
import { DURATION_OPTIONS } from "../types"

interface RescheduleDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  appointmentId: string
  /** "YYYY-MM-DD" from AppointmentListItem.appointmentDate */
  currentDate: string
  /** "HH:MM" from AppointmentListItem.appointmentTime */
  currentTime: string
  currentDuration: number
  onSuccess: () => void
}

export default function RescheduleDialog({
  open,
  onOpenChange,
  appointmentId,
  currentDate,
  currentTime,
  currentDuration,
  onSuccess,
}: RescheduleDialogProps) {
  const [date, setDate]               = React.useState(currentDate)
  const [time, setTime]               = React.useState(currentTime)
  const [duration, setDuration]       = React.useState(currentDuration)
  const [error, setError]             = React.useState<string | null>(null)
  const [isPending, startTransition]  = useTransition()

  // Sync fields when dialog opens with a different appointment
  React.useEffect(() => {
    if (open) {
      setDate(currentDate)
      setTime(currentTime)
      setDuration(currentDuration)
      setError(null)
    }
  }, [open, currentDate, currentTime, currentDuration])

  function handleConfirm() {
    setError(null)
    startTransition(async () => {
      const result = await rescheduleAppointment(appointmentId, {
        appointmentDate: date,
        appointmentTime: time,
        durationMinutes: duration,
      })
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
          <DialogTitle>Reschedule Appointment</DialogTitle>
          <DialogDescription>
            Choose a new date, time, and duration for this appointment.
          </DialogDescription>
        </DialogHeader>

        {/* Current slot reference */}
        <div className="rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Current:</span>{" "}
          {currentDate} · {currentTime} · {currentDuration} min
        </div>

        <div className="grid gap-4 py-2">
          {/* Date + Time */}
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="reschedule-date">New Date</Label>
              <div className="relative">
                <Calendar className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="reschedule-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="pl-9"
                  disabled={isPending}
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="reschedule-time">New Time</Label>
              <div className="relative">
                <Clock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="reschedule-time"
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="pl-9"
                  disabled={isPending}
                />
              </div>
            </div>
          </div>

          {/* Duration */}
          <div className="grid gap-2">
            <Label htmlFor="reschedule-duration">Duration</Label>
            <Select
              value={String(duration)}
              onValueChange={(v) => setDuration(Number(v))}
              disabled={isPending}
            >
              <SelectTrigger id="reschedule-duration">
                <SelectValue placeholder="Select duration" />
              </SelectTrigger>
              <SelectContent>
                {DURATION_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={String(opt.value)}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={isPending}>
            {isPending ? "Rescheduling…" : "Confirm Reschedule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}