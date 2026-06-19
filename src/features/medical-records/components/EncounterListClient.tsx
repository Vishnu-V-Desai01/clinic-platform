"use client"

import { useRouter } from "next/navigation"
import { ArrowLeft, FileText, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import type { Encounter } from "../types"

// ---------------------------------------------------------------
// DB status → display label + colour
// ---------------------------------------------------------------
const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  active: {
    label: "Active",
    className: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  },
  completed: {
    label: "Completed",
    className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  },
  cancelled: {
    label: "Cancelled",
    className: "bg-destructive/15 text-destructive",
  },
}

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------
const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
})

function formatDate(iso: string) {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : dateFormatter.format(d)
}

// ---------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------
function EncounterStatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] ?? {
    label: status,
    className: "bg-muted text-muted-foreground",
  }
  return (
    <Badge
      variant="outline"
      className={cn(
        "shrink-0 rounded-full border-transparent font-medium",
        config.className,
      )}
    >
      {config.label}
    </Badge>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted">
        <FileText className="size-6 text-muted-foreground" aria-hidden="true" />
      </div>
      <p className="mt-4 font-semibold text-foreground">
        No encounters recorded yet
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        New medical records for this patient will appear here.
      </p>
    </div>
  )
}

// ---------------------------------------------------------------
// Props
// ---------------------------------------------------------------
interface EncounterListClientProps {
  patientId: string
  patientName: string
  patientMrn: string
  encounters: Encounter[]
  userRole: "doctor" | "staff"
}

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------
export default function EncounterListClient({
  patientId,
  patientName,
  patientMrn,
  encounters,
  userRole,
}: EncounterListClientProps) {
  const router = useRouter()

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
      {/* Header */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-9 shrink-0 rounded-full"
            aria-label="Go back to patient"
            onClick={() => router.push(`/patients/${patientId}`)}
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
          </Button>
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Medical Records
            </h1>
            <p className="text-sm text-muted-foreground">
              {patientName} · MRN: {patientMrn}
            </p>
          </div>
        </div>

        {userRole === "doctor" && (
          <Button
            type="button"
            onClick={() => router.push(`/patients/${patientId}/records/new`)}
            className="shrink-0 self-start"
          >
            <Plus className="mr-2 size-4" aria-hidden="true" />
            New Encounter
          </Button>
        )}
      </header>

      {/* Timeline */}
      <section className="mt-8" aria-label="Encounter timeline">
        {encounters.length === 0 ? (
          <EmptyState />
        ) : (
          <ol className="relative">
            {encounters.map((encounter) => (
              <li
                key={encounter.id}
                className="grid grid-cols-[1fr] sm:grid-cols-[7.5rem_1fr] sm:gap-x-5"
              >
                {/* Date column — desktop */}
                <div className="hidden pt-6 text-right text-sm font-medium text-muted-foreground sm:block">
                  {formatDate(encounter.encounter_date)}
                </div>

                {/* Rail + card */}
                <div className="relative pb-5 pl-5 sm:pl-6">
                  {/* Vertical rail line */}
                  <span
                    className="absolute left-0 top-0 h-full border-l border-border"
                    aria-hidden="true"
                  />
                  {/* Rail dot */}
                  <span
                    className="absolute -left-[5px] top-6 size-2.5 rounded-full border-2 border-background bg-muted-foreground/60"
                    aria-hidden="true"
                  />

                  {/* Date — mobile (above card) */}
                  <p className="mb-2 text-sm font-medium text-muted-foreground sm:hidden">
                    {formatDate(encounter.encounter_date)}
                  </p>

                  <Card
                    role="button"
                    tabIndex={0}
                    onClick={() =>
                      router.push(
                        `/patients/${patientId}/records/${encounter.id}`,
                      )
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault()
                        router.push(
                          `/patients/${patientId}/records/${encounter.id}`,
                        )
                      }
                    }}
                    aria-label={`Open encounter from ${formatDate(encounter.encounter_date)}: ${encounter.chief_complaint ?? "No chief complaint"}`}
                    className="cursor-pointer rounded-xl border border-border bg-card p-4 shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:p-5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-semibold text-foreground">
                        {encounter.chief_complaint ?? (
                          <span className="font-normal italic text-muted-foreground">
                            No chief complaint recorded
                          </span>
                        )}
                      </p>
                      <EncounterStatusBadge status={encounter.status} />
                    </div>

                    {/* Notes preview */}
                    {encounter.notes && (
                      <p className="mt-1.5 line-clamp-1 text-sm text-muted-foreground">
                        {encounter.notes}
                      </p>
                    )}
                  </Card>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  )
}