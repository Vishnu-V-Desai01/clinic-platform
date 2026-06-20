// src/features/patients/patient-profile.tsx
"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  AlertCircle, Archive, CalendarClock, Clock,
  Droplet, Heart, MapPin, Pencil, Phone,
} from "lucide-react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

import { archivePatient } from "./actions"
import { calculateAge, genderLabel, statusLabel } from "./types"
import type { PatientRecord, PatientStatus } from "./types"

import {
  ENCOUNTER_STATUS_LABELS,
  type Encounter,
  type EncounterStatus,
} from "@/features/medical-records/types"

import {
  durationLabel,
  statusLabel as appointmentStatusLabel,
  type AppointmentListItem,
  type AppointmentStatus,
} from "@/features/appointments/types"

import { CarePlanView } from "@/features/care-plans/components/care-plan-view"

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function getInitials(first: string, last: string) {
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase()
}

function formatDate(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
  })
}

function formatSince(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    month: "long", year: "numeric",
  })
}

const STATUS_BADGE: Record<PatientStatus, string> = {
  active:
    "border-emerald-200 bg-emerald-100 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  inactive:
    "border-border bg-muted text-muted-foreground",
  archived:
    "border-amber-200 bg-amber-100 text-amber-700 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
}

const ENCOUNTER_STATUS_BADGE: Record<EncounterStatus, string> = {
  active:
    "border-sky-200 bg-sky-100 text-sky-800 dark:border-sky-800 dark:bg-sky-900/30 dark:text-sky-400",
  completed:
    "border-emerald-200 bg-emerald-100 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  cancelled:
    "border-destructive/30 bg-destructive/10 text-destructive",
}

const APPOINTMENT_STATUS_BADGE: Record<AppointmentStatus, string> = {
  scheduled:
    "border-sky-200 bg-sky-100 text-sky-800 dark:border-sky-800 dark:bg-sky-900/30 dark:text-sky-400",
  completed:
    "border-emerald-200 bg-emerald-100 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  cancelled:
    "border-destructive/30 bg-destructive/10 text-destructive",
  no_show:
    "border-amber-200 bg-amber-100 text-amber-700 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
}

function EmptyState({ title, note }: { title: string; note?: string }) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-8 text-center">
      <Clock className="size-6 text-muted-foreground" />
      <p className="text-sm font-medium text-foreground">{title}</p>
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Main component                                                             */
/* -------------------------------------------------------------------------- */

interface PatientProfileProps {
  patient: PatientRecord
  recentEncounters?: Encounter[]
  recentAppointments?: AppointmentListItem[]
}

export default function PatientProfile({
  patient,
  recentEncounters = [],
  recentAppointments = [],
}: PatientProfileProps) {
  const router                       = useRouter()
  const [isPending, startTransition] = useTransition()

  const fullName = `${patient.first_name} ${patient.last_name}`
  const initials = getInitials(patient.first_name, patient.last_name)
  const age      = calculateAge(patient.date_of_birth)

  function handleArchive() {
    if (!confirm("Archive this patient? They will no longer appear in the active list.")) return
    startTransition(async () => {
      const result = await archivePatient(patient.id)
      if (result.success) {
        router.push("/dashboard/patients")
        router.refresh()
      } else {
        alert(result.error)
      }
    })
  }

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6 md:px-6">

      {/* Page header */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Patient Profile
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {fullName} <span className="px-1">&bull;</span> MRN:{" "}
            {patient.patient_id_number ?? "—"}
          </p>
        </div>
        <Button onClick={() => router.push(`/dashboard/patients/${patient.id}/edit`)}>
          <Pencil aria-hidden="true" /> Edit
        </Button>
      </header>

      {/* Hero card */}
      <Card className="mt-6">
        <CardContent className="flex flex-wrap items-start justify-between gap-4 pt-6">
          <div className="flex items-center gap-4">
            <Avatar className="size-14">
              <AvatarFallback className="bg-primary/10 text-base font-semibold text-primary">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div>
              <h2 className="text-lg font-semibold text-foreground">{fullName}</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {age !== null ? `Age: ${age}` : "Age: —"}
                <span className="px-1.5">&bull;</span>
                {genderLabel(patient.gender)}
                <span className="px-1.5">&bull;</span>
                <span className="text-foreground">{patient.phone}</span>
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="outline" size="sm"
                  onClick={() => router.push(`/dashboard/patients/${patient.id}/edit`)}>
                  <Pencil /> Edit
                </Button>
                <Button variant="outline" size="sm"
                  disabled={isPending} onClick={handleArchive}>
                  <Archive /> Archive
                </Button>
              </div>
            </div>
          </div>
          <Badge className={STATUS_BADGE[patient.status]}>
            {statusLabel(patient.status)}
          </Badge>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          {
            icon: <CalendarClock className="size-4" />,
            label: "Patient Since",
            value: formatSince(patient.created_at),
          },
          {
            icon: <Clock className="size-4" />,
            label: "Date of Birth",
            value: formatDate(patient.date_of_birth),
          },
          {
            icon: <Droplet className="size-4" />,
            label: "Blood Group",
            value: patient.blood_group ?? "—",
          },
        ].map(({ icon, label, value }) => (
          <div key={label} className="rounded-xl border bg-muted/40 p-4">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              {icon}
              <span className="text-xs font-medium">{label}</span>
            </div>
            <p className="mt-1.5 text-xl font-semibold tracking-tight text-foreground">
              {value}
            </p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="mt-6">
  <TabsList className="w-full justify-start overflow-x-auto border-b border-border">
    <TabsTrigger value="overview" className="shrink-0">Overview</TabsTrigger>
    <TabsTrigger value="medical-history" className="shrink-0">Medical History</TabsTrigger>
    <TabsTrigger value="care-profile" className="shrink-0">Care Profile</TabsTrigger>
    <TabsTrigger value="appointments" className="shrink-0">Appointments</TabsTrigger>
    <TabsTrigger value="payments" className="shrink-0">Payments</TabsTrigger>
  </TabsList>

        {/* Overview tab */}
        <TabsContent value="overview" className="mt-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <Phone className="size-4 text-foreground/70" /> Emergency Contact
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {patient.emergency_contact_name ? (
                  <>
                    <p className="font-medium text-foreground">
                      {patient.emergency_contact_name}
                    </p>
                    {patient.emergency_contact_phone && (
                      <p className="flex items-center gap-2 text-muted-foreground">
                        <Phone className="size-4" />
                        {patient.emergency_contact_phone}
                      </p>
                    )}
                    {patient.emergency_contact_relationship && (
                      <p className="text-muted-foreground">
                        {patient.emergency_contact_relationship}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-muted-foreground">Not provided</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <Droplet className="size-4 text-foreground/70" /> Blood Group &amp; Address
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p className="text-muted-foreground">
                  Blood Group:{" "}
                  <span className="font-semibold text-foreground">
                    {patient.blood_group ?? "—"}
                  </span>
                </p>
                {patient.address || patient.city ? (
                  <p className="flex items-start gap-2 text-muted-foreground">
                    <MapPin className="mt-0.5 size-4 shrink-0" />
                    {[patient.address, patient.city, patient.state, patient.postal_code]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                ) : (
                  <p className="text-muted-foreground">No address provided</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <AlertCircle className="size-4 text-foreground/70" /> Medical Status
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div>
                  <p className="text-muted-foreground">Allergies</p>
                  <p className="font-medium text-red-600 dark:text-red-400">
                    {patient.allergies.length > 0
                      ? patient.allergies.join(", ")
                      : "None recorded"}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Conditions</p>
                  {patient.conditions.length > 0 ? (
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-foreground">
                      {patient.conditions.map((c) => <li key={c}>{c}</li>)}
                    </ul>
                  ) : (
                    <p className="font-medium text-foreground">None recorded</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {patient.notes && (
              <Card className="md:col-span-2 lg:col-span-3">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <Heart className="size-4 text-foreground/70" /> Notes
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                    {patient.notes}
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* Medical History tab */}
        <TabsContent value="medical-history" className="mt-6">
          {recentEncounters.length === 0 ? (
            <EmptyState
              title="No medical records yet"
              note="Consultation notes, diagnoses, and test results will appear here."
            />
          ) : (
            <div className="space-y-3">
              {recentEncounters.map((enc) => (
                <Card
                  key={enc.id}
                  role="button"
                  tabIndex={0}
                  className="cursor-pointer transition-shadow hover:shadow-md"
                  onClick={() => router.push(`/dashboard/patients/${patient.id}/records/${enc.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault()
                      router.push(`/dashboard/patients/${patient.id}/records/${enc.id}`)
                    }
                  }}
                >
                  <CardContent className="flex items-center justify-between gap-4 py-4">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">
                        {enc.chief_complaint ?? "No chief complaint recorded"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {formatDate(enc.encounter_date)}
                      </p>
                    </div>
                    <Badge className={ENCOUNTER_STATUS_BADGE[enc.status]}>
                      {ENCOUNTER_STATUS_LABELS[enc.status]}
                    </Badge>
                  </CardContent>
                </Card>
              ))}
              <Button
                variant="outline"
                className="w-full"
                onClick={() => router.push(`/dashboard/patients/${patient.id}/records`)}
              >
                View All Medical Records
              </Button>
            </div>
          )}
        </TabsContent>

        {/* Care Profile tab — integrated with CarePlanView */}
        <TabsContent value="care-profile" className="mt-6">
          <CarePlanView patientId={patient.id} />
        </TabsContent>

        {/* Appointments tab */}
        <TabsContent value="appointments" className="mt-6">
          {recentAppointments.length === 0 ? (
            <EmptyState
              title="No appointments yet"
              note="Scheduled, completed, and cancelled appointments will appear here."
            />
          ) : (
            <div className="space-y-3">
              {recentAppointments.map((apt) => (
                <Card key={apt.id}>
                  <CardContent className="flex items-center justify-between gap-4 py-4">
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">{apt.doctorName}</p>
                      <p className="text-sm text-muted-foreground">
                        {apt.appointmentDate} at {apt.appointmentTime}{" "}
                        <span className="px-1">&bull;</span> {durationLabel(apt.durationMinutes)}
                      </p>
                      {apt.chiefComplaint && (
                        <p className="mt-0.5 truncate text-sm text-muted-foreground">
                          {apt.chiefComplaint}
                        </p>
                      )}
                    </div>
                    <Badge className={APPOINTMENT_STATUS_BADGE[apt.status]}>
                      {appointmentStatusLabel(apt.status)}
                    </Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Payments tab — not yet built */}
        <TabsContent value="payments" className="mt-6">
          <EmptyState title="Payments coming soon"
            note="Invoices, balances, and payment history will appear here." />
        </TabsContent>
      </Tabs>

      {/* Footer */}
      <footer className="mt-6 border-t pt-4 text-xs text-muted-foreground">
        Last updated: {formatDate(patient.updated_at)}
      </footer>
    </div>
  )
}