"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  Activity,
  ArrowLeft,
  FileText,
  FlaskConical,
  Pill,
  Stethoscope,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import type { EncounterWithDetails } from "../types"
import {
  COMMON_OBSERVATION_TYPES,
  DIAGNOSIS_STATUS_LABELS,
  ENCOUNTER_STATUS_LABELS,
  PRESCRIPTION_STATUS_LABELS,
  TEST_RESULT_STATUS_LABELS,
} from "../types"
import {
  updateDiagnosisStatus,
  updateEncounterStatus,
  updatePrescriptionStatus,
  updateTestResult,
} from "../actions"

// ---------------------------------------------------------------
// DB status value → colour class
// ---------------------------------------------------------------
const STATUS_BADGE_CLASS: Record<string, string> = {
  active:    "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  completed: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  cancelled: "bg-destructive/15 text-destructive",
  resolved:  "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  inactive:  "bg-muted text-muted-foreground",
  stopped:   "bg-destructive/15 text-destructive",
  ordered:   "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  pending:   "bg-amber-500/15 text-amber-700 dark:text-amber-400",
}

// ---------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------
function StatusBadge({ status, label }: { status: string; label: string }) {
  return (
    <Badge
      variant="secondary"
      className={cn(
        "border-transparent font-medium",
        STATUS_BADGE_CLASS[status] ?? "bg-muted text-muted-foreground",
      )}
    >
      {label}
    </Badge>
  )
}

function SectionHeader({
  icon: Icon,
  title,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
}) {
  return (
    <CardHeader className="flex flex-row items-center gap-3 space-y-0">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Icon className="size-4" />
      </span>
      <CardTitle className="text-base font-semibold">{title}</CardTitle>
    </CardHeader>
  )
}

// Converts DB observation_type to a display label.
// Checks COMMON_OBSERVATION_TYPES first, then falls back to capitalise.
function observationTypeLabel(type: string): string {
  const found = COMMON_OBSERVATION_TYPES.find((t) => t.value === type)
  if (found) return found.label
  return type
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
})

function formatDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : dateFormatter.format(d)
}

// ---------------------------------------------------------------
// Props
// ---------------------------------------------------------------
interface EncounterDetailClientProps {
  encounter:  EncounterWithDetails
  patientId:  string
  userRole:   "doctor" | "staff"
  doctorName: string
}

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------
export default function EncounterDetailClient({
  encounter,
  patientId,
  userRole,
  doctorName,
}: EncounterDetailClientProps) {
  const router                        = useRouter()
  const [isPending, startTransition]  = useTransition()
  const [actionError, setActionError] = useState<string | null>(null)

  const isDoctor = userRole === "doctor"

  // ---------------------------------------------------------------
  // Action helpers
  // ---------------------------------------------------------------
  function handleMarkCompleted() {
    setActionError(null)
    startTransition(async () => {
      const result = await updateEncounterStatus(encounter.id, {
        status: "completed",
      })
      if ("error" in result) setActionError(result.error)
      else router.refresh()
    })
  }

  function handleDiagnosisStatus(id: string, status: string) {
    setActionError(null)
    startTransition(async () => {
      const result = await updateDiagnosisStatus(id, { status })
      if ("error" in result) setActionError(result.error)
      else router.refresh()
    })
  }

  function handlePrescriptionStatus(id: string, status: string) {
    setActionError(null)
    startTransition(async () => {
      const result = await updatePrescriptionStatus(id, { status })
      if ("error" in result) setActionError(result.error)
      else router.refresh()
    })
  }

  function handleTestResultStatus(id: string, status: string) {
    setActionError(null)
    startTransition(async () => {
      const result = await updateTestResult(id, { status })
      if ("error" in result) setActionError(result.error)
      else router.refresh()
    })
  }

  // ---------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">

      {/* Header */}
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <Button
            variant="outline"
            size="icon"
            className="size-9 shrink-0 rounded-full"
            aria-label="Go back to medical records"
            onClick={() => router.push(`/patients/${patientId}/records`)}
          >
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Encounter
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {formatDate(encounter.encounter_date)} · {doctorName}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 sm:pt-1">
          <StatusBadge
            status={encounter.status}
            label={ENCOUNTER_STATUS_LABELS[encounter.status]}
          />
          {isDoctor && encounter.status === "active" && (
            <Button
              variant="outline"
              size="sm"
              disabled={isPending}
              onClick={handleMarkCompleted}
            >
              Mark Completed
            </Button>
          )}
        </div>
      </header>

      {/* Action error */}
      {actionError && (
        <div className="mb-4 rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {actionError}
        </div>
      )}

      {/* Cards grid */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">

        {/* ── Notes ── */}
        <Card className="rounded-xl border shadow-sm">
          <SectionHeader icon={FileText} title="Notes" />
          <CardContent className="space-y-4">
            {encounter.chief_complaint && (
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Chief Complaint
                </p>
                <p className="text-sm text-foreground">
                  {encounter.chief_complaint}
                </p>
              </div>
            )}
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Clinical Notes
              </p>
              {encounter.notes ? (
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                  {encounter.notes}
                </p>
              ) : (
                <p className="text-sm italic text-muted-foreground">
                  No notes recorded.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ── Diagnoses ── */}
        <Card className="rounded-xl border shadow-sm">
          <SectionHeader icon={Stethoscope} title="Diagnoses" />
          <CardContent>
            {encounter.diagnoses.length === 0 ? (
              <p className="text-sm italic text-muted-foreground">
                No diagnoses recorded.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {encounter.diagnoses.map((dx) => (
                  <li
                    key={dx.id}
                    className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        {dx.condition_name}
                      </p>
                      {(dx.code ?? dx.severity) && (
                        <p className="text-xs text-muted-foreground">
                          {[
                            dx.code
                              ? `${dx.code_system ?? "Code"}: ${dx.code}`
                              : null,
                            dx.severity
                              ? dx.severity.charAt(0).toUpperCase() +
                                dx.severity.slice(1)
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      )}
                    </div>
                    {isDoctor ? (
                      <Select
                        value={dx.status}
                        disabled={isPending}
                        onValueChange={(v) => handleDiagnosisStatus(dx.id, v)}
                      >
                        <SelectTrigger className="h-8 w-[130px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="resolved">Resolved</SelectItem>
                          <SelectItem value="inactive">Inactive</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <StatusBadge
                        status={dx.status}
                        label={DIAGNOSIS_STATUS_LABELS[dx.status]}
                      />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* ── Vitals / Observations ── */}
        <Card className="rounded-xl border shadow-sm">
          <SectionHeader icon={Activity} title="Vitals" />
          <CardContent>
            <div className="w-full overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Observation</TableHead>
                    <TableHead>Value</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead>Code</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {encounter.observations.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        className="text-center italic text-muted-foreground"
                      >
                        No vitals recorded.
                      </TableCell>
                    </TableRow>
                  ) : (
                    encounter.observations.map((obs) => (
                      <TableRow key={obs.id}>
                        <TableCell className="font-medium text-foreground">
                          {observationTypeLabel(obs.observation_type)}
                        </TableCell>
                        <TableCell className="text-foreground">
                          {obs.value}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {obs.unit ?? "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {obs.code
                            ? `${obs.code_system ?? ""} ${obs.code}`.trim()
                            : "—"}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* ── Prescriptions ── */}
        <Card className="rounded-xl border shadow-sm">
          <SectionHeader icon={Pill} title="Prescriptions" />
          <CardContent>
            {encounter.prescriptions.length === 0 ? (
              <p className="text-sm italic text-muted-foreground">
                No prescriptions recorded.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {encounter.prescriptions.map((rx) => (
                  <li
                    key={rx.id}
                    className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        {rx.medicine_name}{" "}
                        {rx.dosage && (
                          <span className="font-normal text-muted-foreground">
                            {rx.dosage}
                          </span>
                        )}
                      </p>
                      {(rx.frequency ?? rx.duration) && (
                        <p className="text-xs text-muted-foreground">
                          {[rx.frequency, rx.duration]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      )}
                      {rx.instructions && (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {rx.instructions}
                        </p>
                      )}
                    </div>
                    {isDoctor ? (
                      <Select
                        value={rx.status}
                        disabled={isPending}
                        onValueChange={(v) =>
                          handlePrescriptionStatus(rx.id, v)
                        }
                      >
                        <SelectTrigger className="h-8 w-[130px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="stopped">Stopped</SelectItem>
                          <SelectItem value="completed">Completed</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <StatusBadge
                        status={rx.status}
                        label={PRESCRIPTION_STATUS_LABELS[rx.status]}
                      />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* ── Test Results — full width ── */}
        <Card className="rounded-xl border shadow-sm lg:col-span-2">
          <SectionHeader icon={FlaskConical} title="Test Results" />
          <CardContent>
            <div className="w-full overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Test</TableHead>
                    <TableHead>Result</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Flag</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {encounter.test_results.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="text-center italic text-muted-foreground"
                      >
                        No test results recorded.
                      </TableCell>
                    </TableRow>
                  ) : (
                    encounter.test_results.map((tr) => (
                      <TableRow key={tr.id}>
                        <TableCell className="font-medium text-foreground">
                          {tr.test_name}
                          {tr.code && (
                            <span className="block text-xs text-muted-foreground">
                              {[tr.code_system, tr.code]
                                .filter(Boolean)
                                .join(" ")}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-foreground">
                          {tr.result_value ?? tr.result_text ?? (
                            <span className="italic text-muted-foreground">
                              Pending
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {tr.reference_range ?? "—"}
                        </TableCell>
                        <TableCell>
                          {tr.is_abnormal ? (
                            <Badge className="border-transparent bg-destructive/15 text-destructive">
                              Abnormal
                            </Badge>
                          ) : (
                            <span className="text-sm text-muted-foreground">
                              —
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          {/* Both doctor and staff can update test result status */}
                          <Select
                            value={tr.status}
                            disabled={isPending}
                            onValueChange={(v) =>
                              handleTestResultStatus(tr.id, v)
                            }
                          >
                            <SelectTrigger className="h-8 w-[130px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="ordered">Ordered</SelectItem>
                              <SelectItem value="pending">Pending</SelectItem>
                              <SelectItem value="completed">Completed</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  )
}