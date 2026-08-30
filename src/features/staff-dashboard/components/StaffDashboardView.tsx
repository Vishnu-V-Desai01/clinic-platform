'use client'

import { useMemo, useState } from 'react'
import {
  Bell,
  CalendarClock,
  Inbox,
  Loader2,
  Mail,
  Phone,
  Pill,
  Printer,
  Stethoscope,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import type {
  PendingRequestItem,
  TodayAppointmentItem,
  NoPortalPatientItem,
  OutstandingPaymentItem,
  DoctorOption,
  TimeSlot,
} from '../types'
import type { ConfirmAppointmentRequestInput } from '../schema'

// The confirm form collects everything the server action needs except the
// requestId, which the caller already knows from context.
export type ConfirmValues = Omit<ConfirmAppointmentRequestInput, 'requestId'>

// Chat C, objective 6 — one row of the "Recent Medicine Sales" panel.
// doctor_name is the PRESCRIBING doctor (payments.doctor_id, set by
// dispenseAndBillEncounter), not whoever physically dispensed the medicine.
export interface RecentMedicineSaleRow {
  id: string
  patient_name: string
  doctor_name: string
  drug_summary: string
  amount_charged_paise: number
  discounted: boolean
  created_at: string
}

export interface StaffDashboardViewProps {
  pendingRequests?: PendingRequestItem[]
  doctors?: DoctorOption[]
  todaysAppointments?: TodayAppointmentItem[]
  missingEmailPatients?: NoPortalPatientItem[]
  outstandingPayments?: OutstandingPaymentItem[]
  remindersDueToday?: number
  recentMedicineSales?: RecentMedicineSaleRow[]
  isLoading?: boolean
  onConfirm?: (requestId: string, values: ConfirmValues) => Promise<void> | void
  onReject?: (requestId: string, reason: string) => Promise<void> | void
  onAddEmail?: (patientId: string, email: string) => Promise<void> | void
  onPrintSchedule?: () => void
}

// ---------------------------------------------------------------------------
// Preview-only sample data. Real usage always passes real (possibly empty)
// arrays fetched server-side in page.tsx — these defaults exist so the
// component can still be previewed in isolation during development.
// ---------------------------------------------------------------------------

const sampleRequests: PendingRequestItem[] = [
  { id: 'req-1', patientId: 'p-1', patientName: 'Rohan Gupta', patientPhone: '98765 43210', preferredDate: '2026-08-14', preferredTimeSlot: 'morning', reason: 'Follow-up for hypertension, needs medication refill and review.', createdAt: '2026-08-11T04:00:00Z' },
  { id: 'req-2', patientId: 'p-2', patientName: 'Priya Sharma', patientPhone: '87654 32109', preferredDate: '2026-08-14', preferredTimeSlot: 'afternoon', reason: 'Consultation regarding recent blood test results and fatigue.', createdAt: '2026-08-11T05:00:00Z' },
  { id: 'req-3', patientId: 'p-3', patientName: 'Anil Deshmukh', patientPhone: '76543 21098', preferredDate: '2026-08-14', preferredTimeSlot: 'evening', reason: 'Persistent cough and sore throat for three days.', createdAt: '2026-08-11T06:00:00Z' },
  { id: 'req-4', patientId: 'p-4', patientName: 'Sunita Singh', patientPhone: '99112 23344', preferredDate: '2026-08-14', preferredTimeSlot: 'morning', reason: null, createdAt: '2026-08-11T07:00:00Z' },
  { id: 'req-5', patientId: 'p-5', patientName: 'Vikram Nair', patientPhone: '99887 77665', preferredDate: '2026-08-15', preferredTimeSlot: null, reason: null, createdAt: '2026-08-11T08:00:00Z' },
]
const sampleDoctors: DoctorOption[] = [
  { id: 'dr-1', name: 'Dr. Vikram Sharma' },
  { id: 'dr-2', name: 'Dr. Sunita Rao' },
  { id: 'dr-3', name: 'Dr. Meera Iyer' },
]
const sampleAppointments: TodayAppointmentItem[] = [
  { id: 'apt-1', patientId: 'p-6', patientName: 'Aisha Khan', doctorId: 'dr-1', doctorName: 'Dr. Vikram Sharma', appointmentDate: '2026-08-11T05:00:00Z', durationMinutes: 30, status: 'scheduled', chiefComplaint: 'Initial consultation, knee pain and stiffness.' },
  { id: 'apt-2', patientId: 'p-7', patientName: 'Rahul Mehta', doctorId: 'dr-2', doctorName: 'Dr. Sunita Rao', appointmentDate: '2026-08-11T05:30:00Z', durationMinutes: 30, status: 'completed', chiefComplaint: 'Routine follow-up, management of type 2 diabetes.' },
  { id: 'apt-3', patientId: 'p-8', patientName: 'Deepika Patel', doctorId: 'dr-1', doctorName: 'Dr. Vikram Sharma', appointmentDate: '2026-08-11T06:00:00Z', durationMinutes: 30, status: 'cancelled', chiefComplaint: 'General check-up, unable to attend due to work.' },
  { id: 'apt-4', patientId: 'p-9', patientName: 'Sanjay Varma', doctorId: 'dr-2', doctorName: 'Dr. Sunita Rao', appointmentDate: '2026-08-11T06:30:00Z', durationMinutes: 30, status: 'scheduled', chiefComplaint: 'New patient, experiencing lower back pain and fatigue.' },
  { id: 'apt-5', patientId: 'p-10', patientName: 'Lakshmi Reddy', doctorId: 'dr-1', doctorName: 'Dr. Vikram Sharma', appointmentDate: '2026-08-11T07:00:00Z', durationMinutes: 30, status: 'no_show', chiefComplaint: 'Annual physical examination, missed appointment.' },
]
const sampleMissingEmail: NoPortalPatientItem[] = [
  { id: 'p-11', patientName: 'Karan Malhotra', phone: '88990 11223', patientIdNumber: 'CLI-2026-000021', createdAt: '2026-08-01T00:00:00Z' },
  { id: 'p-12', patientName: 'Meera Shah', phone: '99001 22334', patientIdNumber: 'CLI-2026-000022', createdAt: '2026-08-02T00:00:00Z' },
  { id: 'p-13', patientName: 'Suresh Patel', phone: '77889 00112', patientIdNumber: 'CLI-2026-000023', createdAt: '2026-08-03T00:00:00Z' },
]
const samplePayments: OutstandingPaymentItem[] = [
  { id: 'pay-1', patientId: 'p-14', patientName: 'Arjun Singh', amountCharged: 2500, amountPaid: 0, outstandingBalance: 2500, paymentStatus: 'pending', isOverdue: true, createdAt: '2026-08-01T00:00:00Z' },
  { id: 'pay-2', patientId: 'p-15', patientName: 'Neha Gupta', amountCharged: 1800, amountPaid: 0, outstandingBalance: 1800, paymentStatus: 'pending', isOverdue: false, createdAt: '2026-08-05T00:00:00Z' },
  { id: 'pay-3', patientId: 'p-16', patientName: 'Rajesh Sharma', amountCharged: 3200, amountPaid: 0, outstandingBalance: 3200, paymentStatus: 'pending', isOverdue: true, createdAt: '2026-08-02T00:00:00Z' },
]
const sampleMedicineSales: RecentMedicineSaleRow[] = [
  { id: 'ms-1', patient_name: 'Riteek Patil', doctor_name: 'Dr. Vishnu V Desai', drug_summary: 'Dolo 650', amount_charged_paise: 3000, discounted: false, created_at: '2026-08-26T09:42:00Z' },
]

// ---------------------------------------------------------------------------
// Formatting helpers. All render-time only — DB values stay lowercase.
// ---------------------------------------------------------------------------

export const formatINR = (amountRupees: number) =>
  `₹${amountRupees.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const dateFormatter = new Intl.DateTimeFormat('en-IN', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Kolkata' })
const shortDateFormatter = new Intl.DateTimeFormat('en-IN', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'Asia/Kolkata' })
const timeFormatter = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })

// preferred_date is a plain `date` column (no time component) — parse it as
// a calendar date, not an instant, so it doesn't shift a day depending on
// the reader's timezone.
const formatCalendarDate = (value: string) => dateFormatter.format(new Date(`${value}T00:00:00Z`))
const formatToday = () => shortDateFormatter.format(new Date())
const formatISTTime = (isoInstant: string) => timeFormatter.format(new Date(isoInstant))

const timeSlotLabel = (slot: TimeSlot | null): string =>
  slot ? slot.charAt(0).toUpperCase() + slot.slice(1) : 'No preference'

const timeSlotClassMap: Record<string, string> = {
  morning: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  afternoon: 'bg-sky-500/15 text-sky-700 dark:text-sky-400',
  evening: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-400',
}
const timeSlotClass = (slot: TimeSlot | null) =>
  timeSlotClassMap[slot ?? ''] ?? 'bg-muted text-muted-foreground'

const statusLabel = (status: TodayAppointmentItem['status']): string =>
  status === 'no_show' ? 'No Show' : status.charAt(0).toUpperCase() + status.slice(1)

const statusClass = (status: TodayAppointmentItem['status']) =>
  ({
    scheduled: 'bg-sky-500/15 text-sky-700 dark:text-sky-400',
    completed: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
    cancelled: 'bg-muted text-muted-foreground',
    no_show: 'bg-destructive/15 text-destructive',
  })[status]

/**
 * Converts a `datetime-local` input value ("YYYY-MM-DDTHH:mm") into a proper
 * UTC ISO instant, treating the wall-clock value as IST explicitly. This is
 * necessary because <input type="datetime-local"> carries no timezone info,
 * and we never trust the browser's local timezone for clinic scheduling.
 */
function istWallClockToUTCISOString(localValue: string): string {
  const withOffset = `${localValue}:00+05:30`
  return new Date(withOffset).toISOString()
}

// Basic client-side shape check only — the server action is the real
// source of truth for email validation via updatePatientEmailSchema.
const looksLikeEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)

function EmptyState({ icon: Icon, children }: { icon: typeof Inbox; children: string }) {
  return (
    <div className="flex min-h-28 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
      <Icon aria-hidden="true" className="size-7" />
      <span>{children}</span>
    </div>
  )
}
function LoadingRows({ count = 4 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: count }, (_, i) => <Skeleton key={i} className="h-10 w-full" />)}
    </div>
  )
}

export default function StaffDashboardView({
  pendingRequests = sampleRequests,
  doctors = sampleDoctors,
  todaysAppointments = sampleAppointments,
  missingEmailPatients = sampleMissingEmail,
  outstandingPayments = samplePayments,
  remindersDueToday = 18,
  recentMedicineSales = sampleMedicineSales,
  isLoading = false,
  onConfirm,
  onReject,
  onAddEmail,
  onPrintSchedule,
}: StaffDashboardViewProps) {
  const [confirmRequest, setConfirmRequest] = useState<PendingRequestItem | null>(null)
  const [rejectRequest, setRejectRequest] = useState<PendingRequestItem | null>(null)
  const [doctorId, setDoctorId] = useState(doctors[0]?.id ?? '')
  const [dateTime, setDateTime] = useState('')
  const [durationMinutes, setDurationMinutes] = useState('30')
  const [notes, setNotes] = useState('')
  const [rejectReason, setRejectReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [conflictError, setConflictError] = useState('')

  // Inline "Add Email" state — only one row editable at a time.
  const [editingEmailPatientId, setEditingEmailPatientId] = useState<string | null>(null)
  const [emailDraft, setEmailDraft] = useState('')
  const [emailError, setEmailError] = useState('')
  const [emailSubmitting, setEmailSubmitting] = useState(false)

  const sortedAppointments = useMemo(
    () => [...todaysAppointments].sort((a, b) => a.appointmentDate.localeCompare(b.appointmentDate)),
    [todaysAppointments]
  )

  const openConfirm = (request: PendingRequestItem) => {
    setConfirmRequest(request)
    setDoctorId(doctors[0]?.id ?? '')
    setDateTime('')
    setDurationMinutes('30')
    setNotes('')
    setConflictError('')
  }

  const submitConfirm = async () => {
    if (!confirmRequest || !dateTime || !doctorId) return
    setSubmitting(true)
    setConflictError('')
    try {
      await onConfirm?.(confirmRequest.id, {
        doctorId,
        appointmentDate: istWallClockToUTCISOString(dateTime),
        durationMinutes: Number(durationMinutes),
        chiefComplaint: notes || undefined,
      })
      setConfirmRequest(null)
    } catch (error) {
      setConflictError(
        error instanceof Error ? error.message : 'This slot conflicts with an existing appointment.'
      )
    } finally {
      setSubmitting(false)
    }
  }

  const submitReject = async () => {
    if (!rejectRequest || !rejectReason.trim()) return
    setSubmitting(true)
    try {
      await onReject?.(rejectRequest.id, rejectReason.trim())
      setRejectRequest(null)
      setRejectReason('')
    } finally {
      setSubmitting(false)
    }
  }

  const startEditingEmail = (patientId: string) => {
    setEditingEmailPatientId(patientId)
    setEmailDraft('')
    setEmailError('')
  }
  const cancelEditingEmail = () => {
    setEditingEmailPatientId(null)
    setEmailDraft('')
    setEmailError('')
  }
  const submitEmail = async (patientId: string) => {
    const trimmed = emailDraft.trim()
    if (!looksLikeEmail(trimmed)) {
      setEmailError('Enter a valid email address')
      return
    }
    setEmailSubmitting(true)
    setEmailError('')
    try {
      await onAddEmail?.(patientId, trimmed)
      setEditingEmailPatientId(null)
      setEmailDraft('')
    } catch (error) {
      setEmailError(error instanceof Error ? error.message : 'Could not save email')
    } finally {
      setEmailSubmitting(false)
    }
  }

  return (
    <main className="w-full bg-background p-4 text-foreground sm:p-6">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
          <Card>
            <CardHeader className="gap-1 px-4 py-4">
              <div className="flex items-center gap-2">
                <CardTitle className="text-base">Appointment Requests</CardTitle>
                <Badge className="bg-primary text-primary-foreground">{pendingRequests.length} pending</Badge>
              </div>
            </CardHeader>
            <CardContent className="px-2 pb-2 sm:px-4">
              {isLoading ? (
                <LoadingRows />
              ) : pendingRequests.length === 0 ? (
                <EmptyState icon={Inbox}>No pending requests</EmptyState>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Patient</TableHead>
                        <TableHead>Requested</TableHead>
                        <TableHead>Time</TableHead>
                        <TableHead className="hidden xl:table-cell">Reason</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pendingRequests.map((request) => (
                        <TableRow key={request.id}>
                          <TableCell className="min-w-40">
                            <div className="font-medium">{request.patientName}</div>
                            <div className="flex items-center gap-1 text-sm text-muted-foreground">
                              <Phone aria-hidden="true" className="size-3" />
                              {request.patientPhone}
                            </div>
                          </TableCell>
                          <TableCell className="whitespace-nowrap">{formatCalendarDate(request.preferredDate)}</TableCell>
                          <TableCell>
                            <Badge className={timeSlotClass(request.preferredTimeSlot)}>
                              {timeSlotLabel(request.preferredTimeSlot)}
                            </Badge>
                          </TableCell>
                          <TableCell className="hidden max-w-56 xl:table-cell">
                            <span className="block truncate text-sm text-muted-foreground">{request.reason ?? '—'}</span>
                          </TableCell>
                          <TableCell>
                            <div className="flex justify-end gap-2">
                              <Button size="sm" onClick={() => openConfirm(request)}>Confirm</Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => { setRejectRequest(request); setRejectReason('') }}
                              >
                                Reject
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-start justify-between px-4 py-4">
              <div>
                <CardTitle className="text-base">Today&apos;s Schedule</CardTitle>
                <CardDescription>{formatToday()}</CardDescription>
              </div>
              <Button size="sm" variant="outline" onClick={() => (onPrintSchedule ? onPrintSchedule() : window.print())}>
                <Printer className="mr-2 size-4" />
                Print Schedule
              </Button>
            </CardHeader>
            <CardContent className="px-2 pb-2 sm:px-4">
              {isLoading ? (
                <LoadingRows count={5} />
              ) : sortedAppointments.length === 0 ? (
                <EmptyState icon={CalendarClock}>No appointments scheduled for today</EmptyState>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableBody>
                      {sortedAppointments.map((appointment) => (
                        <TableRow
                          key={appointment.id}
                          className={appointment.status === 'cancelled' ? 'line-through' : ''}
                        >
                          <TableCell className="w-20 whitespace-nowrap font-semibold">
                            {formatISTTime(appointment.appointmentDate)}
                          </TableCell>
                          <TableCell className="min-w-32 font-medium">{appointment.patientName}</TableCell>
                          <TableCell className="min-w-44">
                            <div className="flex items-center gap-1 text-sm text-muted-foreground">
                              <Stethoscope aria-hidden="true" className="size-3" />
                              {appointment.doctorName}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge className={statusClass(appointment.status)}>{statusLabel(appointment.status)}</Badge>
                          </TableCell>
                          <TableCell className="max-w-64">
                            <span className="block truncate text-sm text-muted-foreground">
                              {appointment.chiefComplaint ?? '—'}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="gap-1 px-4 py-4">
              <div className="flex items-center gap-2">
                <Pill className="size-4 text-primary" aria-hidden="true" />
                <CardTitle className="text-base">Recent Medicine Sales</CardTitle>
              </div>
              <CardDescription>Pharmacy dispensing, attributed to the prescribing doctor</CardDescription>
            </CardHeader>
            <CardContent className="px-2 pb-2 sm:px-4">
              {isLoading ? (
                <LoadingRows count={3} />
              ) : recentMedicineSales.length === 0 ? (
                <EmptyState icon={Pill}>No medicine sales yet</EmptyState>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Patient</TableHead>
                        <TableHead>Doctor</TableHead>
                        <TableHead className="hidden md:table-cell">Medicines</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recentMedicineSales.map((sale) => (
                        <TableRow key={sale.id}>
                          <TableCell className="min-w-32 font-medium">{sale.patient_name}</TableCell>
                          <TableCell className="min-w-32 text-sm text-muted-foreground">{sale.doctor_name}</TableCell>
                          <TableCell className="hidden max-w-56 md:table-cell">
                            <span className="block truncate text-sm text-muted-foreground">{sale.drug_summary}</span>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex flex-col items-end gap-1">
                              <span className="font-semibold">{formatINR(sale.amount_charged_paise / 100)}</span>
                              {sale.discounted && (
                                <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400">Discounted</Badge>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <aside className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardHeader className="gap-1 px-4 py-4">
              <CardTitle className="text-base">Missing Patient Email</CardTitle>
              <CardDescription>These patients can&apos;t access the patient portal or link a family account</CardDescription>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {isLoading ? (
                <LoadingRows count={3} />
              ) : missingEmailPatients.length === 0 ? (
                <p className="py-3 text-sm text-muted-foreground">All recent patients have email on file</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {missingEmailPatients.map((patient) => (
                    <div className="flex flex-col gap-2" key={patient.id}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{patient.patientName}</p>
                          <p className="flex items-center gap-1 text-sm text-muted-foreground">
                            <Mail aria-hidden="true" className="size-3" />
                            {patient.phone}
                          </p>
                        </div>
                        {editingEmailPatientId !== patient.id && (
                          <Button
                            variant="link"
                            size="sm"
                            className="shrink-0 px-0 text-primary"
                            onClick={() => startEditingEmail(patient.id)}
                          >
                            Add Email
                          </Button>
                        )}
                      </div>
                      {editingEmailPatientId === patient.id && (
                        <div className="flex flex-col gap-1.5 rounded-md border border-border bg-muted/30 p-2">
                          <Input
                            type="email"
                            placeholder="patient@example.com"
                            value={emailDraft}
                            onChange={(event) => setEmailDraft(event.target.value)}
                            autoFocus
                          />
                          {emailError && <p className="text-xs text-destructive">{emailError}</p>}
                          <div className="flex justify-end gap-2">
                            <Button size="sm" variant="outline" onClick={cancelEditingEmail} disabled={emailSubmitting}>
                              Cancel
                            </Button>
                            <Button size="sm" onClick={() => submitEmail(patient.id)} disabled={emailSubmitting}>
                              {emailSubmitting && <Loader2 className="mr-2 size-3 animate-spin" />}
                              Save
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="px-4 py-4">
              <CardTitle className="text-base">Outstanding Payments</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {isLoading ? (
                <LoadingRows count={3} />
              ) : outstandingPayments.length === 0 ? (
                <p className="py-3 text-sm text-muted-foreground">No outstanding balances</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {outstandingPayments.map((payment) => (
                    <div
                      className="flex items-center justify-between gap-3 border-b border-border pb-3 last:border-0 last:pb-0"
                      key={payment.id}
                    >
                      <span className="font-medium">{payment.patientName}</span>
                      <div className="flex flex-col items-end gap-1">
                        <span className="font-semibold">{formatINR(payment.outstandingBalance)}</span>
                        {payment.isOverdue && <Badge className="bg-destructive/15 text-destructive">Overdue</Badge>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-start gap-3 px-4 py-4">
              <Bell aria-hidden="true" className="mt-1 size-5 text-primary" />
              <div>
                <p className="text-base font-semibold">Reminders Due Today</p>
                <p className="text-3xl font-semibold leading-tight">{remindersDueToday}</p>
                <p className="text-sm">Reminders scheduled for today</p>
                <p className="text-xs text-muted-foreground">Sent automatically — no action needed</p>
              </div>
            </CardContent>
          </Card>
        </aside>
      </div>

      <Dialog open={!!confirmRequest} onOpenChange={(open) => !open && setConfirmRequest(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm appointment</DialogTitle>
            <DialogDescription>
              {confirmRequest &&
                `${confirmRequest.patientName} · ${formatCalendarDate(confirmRequest.preferredDate)} · ${timeSlotLabel(confirmRequest.preferredTimeSlot)}`}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="doctor">Assign Doctor</Label>
              <Select value={doctorId} onValueChange={setDoctorId}>
                <SelectTrigger id="doctor"><SelectValue placeholder="Select a doctor" /></SelectTrigger>
                <SelectContent>
                  {doctors.map((doctor) => (
                    <SelectItem key={doctor.id} value={doctor.id}>{doctor.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="appointment-date">Appointment Date &amp; Time (IST)</Label>
              <Input
                id="appointment-date"
                type="datetime-local"
                value={dateTime}
                onChange={(event) => setDateTime(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="duration">Duration (minutes)</Label>
              <Input
                id="duration"
                type="number"
                min="5"
                step="5"
                value={durationMinutes}
                onChange={(event) => setDurationMinutes(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="notes">Chief Complaint / Notes</Label>
              <Textarea id="notes" value={notes} onChange={(event) => setNotes(event.target.value)} />
            </div>
            <p aria-live="polite" className="min-h-5 text-sm text-destructive">{conflictError}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmRequest(null)}>Cancel</Button>
            <Button disabled={submitting || !dateTime || !doctorId} onClick={submitConfirm}>
              {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
              Confirm Appointment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!rejectRequest} onOpenChange={(open) => !open && setRejectRequest(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reject appointment request</DialogTitle>
            <DialogDescription>{rejectRequest?.patientName}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="reject-reason">Reason for rejection</Label>
            <Textarea id="reject-reason" required value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectRequest(null)}>Cancel</Button>
            <Button disabled={submitting || !rejectReason.trim()} onClick={submitReject}>Submit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  )
}