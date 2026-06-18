"use client"

import { useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import {
  Plus,
  Search,
  MoreHorizontal,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { PageHeader } from "@/components/page-header"

import {
  type AppointmentListItem,
  type AppointmentStatus,
  type DoctorOption,
  statusLabel,
} from "../types"
import NewAppointmentDialog, { type PatientOption } from "./new-appointment-dialog"
import RescheduleDialog from "./reschedule-dialog"
import CancelDialog from "./cancel-dialog"

const PAGE_SIZE = 10

const STATUS_STYLES: Record<AppointmentStatus, string> = {
  scheduled: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  completed: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  cancelled: "bg-destructive/15 text-destructive",
  no_show:   "bg-amber-500/15 text-amber-700 dark:text-amber-400",
}

function StatusBadge({ status }: { status: AppointmentStatus }) {
  return (
    <Badge
      variant="outline"
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

function displayDateTime(date: string, time: string): string {
  try {
    return new Date(`${date}T${time}:00+05:30`).toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      day:      "numeric",
      month:    "short",
      year:     "numeric",
      hour:     "numeric",
      minute:   "2-digit",
      hour12:   true,
    })
  } catch {
    return `${date} ${time}`
  }
}

interface AppointmentsListProps {
  appointments: AppointmentListItem[]
  patients:     PatientOption[]
  doctors:      DoctorOption[]
}

export default function AppointmentsList({
  appointments,
  patients,
  doctors,
}: AppointmentsListProps) {
  const router = useRouter()

  // Filters
  const [search,       setSearch]       = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [scope,        setScope]        = useState("upcoming")
  const [page,         setPage]         = useState(1)

  // Dialog targets — null means closed
  const [bookingOpen,      setBookingOpen]      = useState(false)
  const [rescheduleTarget, setRescheduleTarget] = useState<AppointmentListItem | null>(null)
  const [cancelTarget,     setCancelTarget]     = useState<AppointmentListItem | null>(null)

  const filtered = useMemo(() => {
    const now = new Date()
    const q   = search.trim().toLowerCase()

    return appointments
      .filter((a) => {
        if (q && !`${a.patientName} ${a.patientMrn ?? ""}`.toLowerCase().includes(q))
          return false
        if (statusFilter !== "all" && a.status !== statusFilter) return false
        if (scope !== "all") {
          const t = new Date(`${a.appointmentDate}T${a.appointmentTime}:00+05:30`)
          if (scope === "upcoming" && t <  now) return false
          if (scope === "past"     && t >= now) return false
        }
        return true
      })
      .sort((a, b) => {
        const aT = new Date(`${a.appointmentDate}T${a.appointmentTime}:00+05:30`).getTime()
        const bT = new Date(`${b.appointmentDate}T${b.appointmentTime}:00+05:30`).getTime()
        // Past: newest first. Upcoming / All: soonest first.
        return scope === "past" ? bT - aT : aT - bT
      })
  }, [appointments, search, statusFilter, scope])

  const totalPages  = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const startIndex  = (currentPage - 1) * PAGE_SIZE
  const pageRows    = filtered.slice(startIndex, startIndex + PAGE_SIZE)
  const showingFrom = filtered.length === 0 ? 0 : startIndex + 1
  const showingTo   = Math.min(startIndex + PAGE_SIZE, filtered.length)

  function changeFilter<T>(setter: (v: T) => void, value: T) {
    setter(value)
    setPage(1)
  }

  function handleSuccess() {
    router.refresh()
  }

  return (
    <>
      <div className="flex flex-col gap-6">

        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <PageHeader title="Appointments" />
          <Button onClick={() => setBookingOpen(true)}>
            <Plus className="size-4" />
            Book Appointment
          </Button>
        </div>

        {/* Toolbar */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                value={search}
                onChange={(e) => changeFilter(setSearch, e.target.value)}
                placeholder="Search by patient name or MRN"
                className="pl-9"
              />
            </div>

            <Select
              value={statusFilter}
              onValueChange={(v) => changeFilter(setStatusFilter, v)}
            >
              <SelectTrigger className="w-full sm:w-[160px]">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="scheduled">Scheduled</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
                <SelectItem value="no_show">No Show</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Tabs value={scope} onValueChange={(v) => changeFilter(setScope, v)}>
            <TabsList>
              <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
              <TabsTrigger value="past">Past</TabsTrigger>
              <TabsTrigger value="all">All</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Table */}
        <div className="rounded-xl border border-border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="min-w-[220px]">Patient</TableHead>
                  <TableHead className="min-w-[160px]">Doctor</TableHead>
                  <TableHead className="min-w-[190px]">Date &amp; Time</TableHead>
                  <TableHead className="min-w-[100px]">Duration</TableHead>
                  <TableHead className="min-w-[120px]">Status</TableHead>
                  <TableHead className="min-w-[120px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageRows.length === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={6} className="h-64">
                      <div className="flex flex-col items-center justify-center gap-2 text-center">
                        <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                          <CalendarClock className="size-6 text-muted-foreground" />
                        </div>
                        <p className="font-medium text-foreground">No appointments found</p>
                        <p className="text-sm text-muted-foreground">
                          Try adjusting your search or filters.
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  pageRows.map((appt) => (
                    <TableRow key={appt.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="size-9">
                            <AvatarFallback className="bg-muted text-xs font-medium text-muted-foreground">
                              {getInitials(appt.patientName)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <div className="font-medium text-foreground">
                              {appt.patientName}
                            </div>
                            {appt.patientMrn && (
                              <div className="text-sm text-muted-foreground">
                                {appt.patientMrn}
                              </div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-foreground">{appt.doctorName}</TableCell>
                      <TableCell className="text-foreground">
                        {displayDateTime(appt.appointmentDate, appt.appointmentTime)}
                      </TableCell>
                      <TableCell className="text-foreground">
                        {appt.durationMinutes} min
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={appt.status} />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              router.push(`/dashboard/appointments/${appt.id}`)
                            }
                          >
                            View
                          </Button>
                          {appt.status === "scheduled" && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  aria-label={`More actions for ${appt.patientName}`}
                                >
                                  <MoreHorizontal className="size-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={() => setRescheduleTarget(appt)}
                                >
                                  Reschedule
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onClick={() => setCancelTarget(appt)}
                                >
                                  Cancel
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination footer */}
          <div className="flex flex-col gap-3 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              Showing {showingFrom}–{showingTo} of {filtered.length}
            </p>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
              >
                <ChevronLeft className="size-4" />
                Previous
              </Button>
              <span className="px-3 text-sm text-muted-foreground">
                Page {currentPage} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
              >
                Next
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Dialogs rendered outside the main div so they're not clipped */}
      <NewAppointmentDialog
        open={bookingOpen}
        onOpenChange={setBookingOpen}
        patients={patients}
        doctors={doctors}
        onSuccess={handleSuccess}
      />

      <RescheduleDialog
        open={rescheduleTarget !== null}
        onOpenChange={(open) => { if (!open) setRescheduleTarget(null) }}
        appointmentId={rescheduleTarget?.id ?? ""}
        currentDate={rescheduleTarget?.appointmentDate ?? ""}
        currentTime={rescheduleTarget?.appointmentTime ?? ""}
        currentDuration={rescheduleTarget?.durationMinutes ?? 30}
        onSuccess={handleSuccess}
      />

      <CancelDialog
        open={cancelTarget !== null}
        onOpenChange={(open) => { if (!open) setCancelTarget(null) }}
        appointmentId={cancelTarget?.id ?? ""}
        patientName={cancelTarget?.patientName ?? ""}
        appointmentDateTime={
          cancelTarget
            ? `${cancelTarget.appointmentDate}T${cancelTarget.appointmentTime}:00+05:30`
            : ""
        }
        onSuccess={handleSuccess}
      />
    </>
  )
}