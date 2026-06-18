"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, CalendarDays, User as UserIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"

import {
  type AppointmentDetail,
  type AppointmentStatus,
  statusLabel,
  durationLabel,
} from "../types"
import { updateAppointmentStatus } from "../actions"
import RescheduleDialog from "./reschedule-dialog"
import CancelDialog from "./cancel-dialog"

const STATUS_STYLES: Record<AppointmentStatus, string> = {
  scheduled: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  completed: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  cancelled: "bg-destructive/15 text-destructive",
  no_show:   "bg-amber-500/15 text-amber-700 dark:text-amber-400",
}

function StatusBadge({ status }: { status: AppointmentStatus }) {
  return (
    <Badge
      variant="secondary"
      className={cn("border-transparent font-medium", STATUS_STYLES[status])}
    >
      {statusLabel(status)}
    </Badge>
  )
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function formatDateTime(date: string, time: string): string {
  try {
    return new Date(`${date}T${time}:00+05:30`).toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      weekday: "short",
      day:     "numeric",
      month:   "short",
      year:    "numeric",
      hour:    "numeric",
      minute:  "2-digit",
      hour12:  true,
    })
  } catch {
    return `${date} ${time}`
  }
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-IN", {
      timeZone: "Asia/Kolkata",
      day:   "numeric",
      month: "short",
      year:  "numeric",
    })
  } catch {
    return iso
  }
}

function DetailRow({
  label,
  children,
  alignTop = false,
}: {
  label: string
  children: React.ReactNode
  alignTop?: boolean
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-1 sm:grid-cols-[160px_1fr] sm:gap-4",
        alignTop ? "sm:items-start" : "sm:items-center",
      )}
    >
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm text-foreground">{children}</dd>
    </div>
  )
}

interface AppointmentDetailViewProps {
  appointment: AppointmentDetail
  userRole:    "doctor" | "staff"
}

export default function AppointmentDetailView({
  appointment,
  userRole,
}: AppointmentDetailViewProps) {
  const router = useRouter()

  const isDoctor    = userRole === "doctor"
  const isScheduled = appointment.status === "scheduled"

  const [rescheduleOpen, setRescheduleOpen] = useState(false)
  const [cancelOpen,     setCancelOpen]     = useState(false)
  const [statusError,    setStatusError]    = useState<string | null>(null)
  const [isPending,      startTransition]   = useTransition()

  function handleMarkStatus(status: "completed" | "no_show") {
    setStatusError(null)
    startTransition(async () => {
      const result = await updateAppointmentStatus(appointment.id, { status })
      if (!result.success) {
        setStatusError(result.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <>
      <div className="flex flex-col gap-6">

        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <Button
              variant="outline"
              size="icon"
              aria-label="Go back"
              className="mt-0.5 shrink-0"
              onClick={() => router.push("/dashboard/appointments")}
            >
              <ArrowLeft className="size-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Appointment Details
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Booked on {formatDate(appointment.createdAt)}
              </p>
            </div>
          </div>
          <div className="sm:pt-1">
            <StatusBadge status={appointment.status} />
          </div>
        </div>

        <Separator />

        {/* Action row — only shown for scheduled appointments */}
        {isScheduled && (
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setRescheduleOpen(true)}
              disabled={isPending}
            >
              Reschedule
            </Button>
            <Button
              variant="outline"
              onClick={() => setCancelOpen(true)}
              disabled={isPending}
              className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              Cancel
            </Button>
            {isDoctor && (
              <>
                <Button
                  onClick={() => handleMarkStatus("completed")}
                  disabled={isPending}
                >
                  {isPending ? "Saving…" : "Mark Completed"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleMarkStatus("no_show")}
                  disabled={isPending}
                >
                  Mark No-show
                </Button>
              </>
            )}
          </div>
        )}

        {statusError && (
          <p className="text-right text-sm text-destructive">{statusError}</p>
        )}

        {/* Cards */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">

          {/* Appointment card */}
          <Card className="gap-0 rounded-xl border p-0 shadow-sm md:col-span-2">
            <div className="flex items-center gap-3 border-b border-border p-5">
              <span className="flex size-9 items-center justify-center rounded-lg bg-sky-500/15 text-sky-700 dark:text-sky-400">
                <CalendarDays className="size-5" />
              </span>
              <h2 className="text-base font-semibold text-foreground">
                Appointment
              </h2>
            </div>
            <dl className="flex flex-col gap-4 p-5">
              <DetailRow label="Date &amp; Time">
                {formatDateTime(appointment.appointmentDate, appointment.appointmentTime)}
              </DetailRow>
              <DetailRow label="Duration">
                {durationLabel(appointment.durationMinutes)}
              </DetailRow>
              <DetailRow label="Doctor">
                {appointment.doctorName}
                {appointment.doctorSpecialization && (
                  <span className="ml-1 text-muted-foreground">
                    · {appointment.doctorSpecialization}
                  </span>
                )}
              </DetailRow>
              <DetailRow label="Status">
                <StatusBadge status={appointment.status} />
              </DetailRow>
              {appointment.chiefComplaint && (
                <DetailRow label="Chief Complaint" alignTop>
                  <p className="leading-relaxed">{appointment.chiefComplaint}</p>
                </DetailRow>
              )}
              {appointment.doctorNotes && (
                <DetailRow label="Doctor Notes" alignTop>
                  <p className="leading-relaxed">{appointment.doctorNotes}</p>
                </DetailRow>
              )}
              {appointment.cancellationReason && (
                <DetailRow label="Cancellation Reason" alignTop>
                  <p className="leading-relaxed">{appointment.cancellationReason}</p>
                </DetailRow>
              )}
            </dl>
          </Card>

          {/* Patient card */}
          <Card className="gap-0 rounded-xl border p-0 shadow-sm md:col-span-1">
            <div className="flex items-center gap-3 border-b border-border p-5">
              <span className="flex size-9 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
                <UserIcon className="size-5" />
              </span>
              <h2 className="text-base font-semibold text-foreground">Patient</h2>
            </div>
            <div className="flex flex-col gap-4 p-5">
              <div className="flex items-center gap-3">
                <Avatar className="size-10">
                  <AvatarFallback className="bg-muted text-sm font-medium text-foreground">
                    {getInitials(appointment.patientName)}
                  </AvatarFallback>
                </Avatar>
                <span className="font-medium text-foreground">
                  {appointment.patientName}
                </span>
              </div>
              {appointment.patientMrn && (
                <p className="text-sm text-muted-foreground">
                  MRN:{" "}
                  <span className="text-foreground">{appointment.patientMrn}</span>
                </p>
              )}
              <button
                type="button"
                onClick={() =>
                  router.push(`/dashboard/patients/${appointment.patientId}`)
                }
                className="self-start rounded-sm text-sm font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                View full profile →
              </button>
            </div>
          </Card>
        </div>

        {/* Activity */}
        <section aria-label="Activity">
          <h2 className="text-sm font-medium text-muted-foreground">Activity</h2>
          <p className="mt-2 text-sm text-foreground">
            Booked on {formatDate(appointment.createdAt)}
          </p>
        </section>
      </div>

      {/* Dialogs */}
      <RescheduleDialog
        open={rescheduleOpen}
        onOpenChange={setRescheduleOpen}
        appointmentId={appointment.id}
        currentDate={appointment.appointmentDate}
        currentTime={appointment.appointmentTime}
        currentDuration={appointment.durationMinutes}
        onSuccess={() => { setRescheduleOpen(false); router.refresh() }}
      />

      <CancelDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        appointmentId={appointment.id}
        patientName={appointment.patientName}
        appointmentDateTime={`${appointment.appointmentDate}T${appointment.appointmentTime}:00+05:30`}
        onSuccess={() => { setCancelOpen(false); router.refresh() }}
      />
    </>
  )
}