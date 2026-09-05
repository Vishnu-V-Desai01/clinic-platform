// src/features/analytics/components/analytics-dashboard-container.tsx
//
// Bridges the presentational AnalyticsDashboard (label-based range state,
// e.g. "This Week") and the backend (snake_case DateRangePreset values,
// e.g. "this_week"). Initial data arrives as a prop from the server
// component (page.tsx) -- zero client fetches on first paint. Range
// changes and rollup trigger a single bundled Server Action call.

'use client'

import { useCallback, useState, useTransition } from 'react'
import AnalyticsDashboard from './analytics-dashboard'
import { Skeleton } from '@/components/ui/skeleton'
import { getAnalyticsDashboardBundle, runDailyRollup } from '../actions'
import type { AnalyticsDashboardBundle } from '../actions'
import type {
  DoctorDashboardResult,
  DoctorDashboardSeries,
  AnomalyAlertRecord,
  AppointmentEfficiencyResult,
} from '../types'
import type { DateRangeFilterInput } from '../schema'

const PRESET_LABEL_TO_VALUE: Record<string, DateRangeFilterInput['preset']> = {
  Today: 'today',
  'This Week': 'this_week',
  'This Month': 'this_month',
  'Last 30 Days': 'last_30_days',
  'Last 90 Days': 'last_90_days',
  Custom: 'custom',
}

function toBannerAnomaly(record: AnomalyAlertRecord) {
  return {
    id: record.id,
    metricName: record.metric_name,
    direction: record.direction,
    actualValue: record.actual_value,
    rollingMean: record.rolling_mean,
    severity: record.severity,
  }
}

function AnalyticsDashboardSkeleton() {
  return (
    <div className="curakin-preview min-h-screen bg-[var(--preview-background)]">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8 flex items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-8 w-56" />
            <Skeleton className="h-4 w-40" />
          </div>
          <Skeleton className="size-9 rounded-lg" />
        </div>

        {/* Filter pills */}
        <div className="mb-6 flex flex-wrap items-center gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-20 rounded-md" />
          ))}
        </div>

        {/* Income section */}
        <div className="mb-8">
          <Skeleton className="mb-4 h-6 w-24" />
          <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-border p-5">
                <Skeleton className="mb-2 h-3 w-20" />
                <Skeleton className="h-7 w-24" />
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-border p-5">
            <Skeleton className="mb-4 h-4 w-32" />
            <Skeleton className="h-[300px] w-full" />
          </div>
        </div>

        {/* Activity section */}
        <div className="mb-8">
          <Skeleton className="mb-4 h-6 w-24" />
          <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-border p-5">
                <Skeleton className="mb-2 h-3 w-24" />
                <Skeleton className="h-7 w-16" />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-border p-5">
                <Skeleton className="mb-4 h-4 w-32" />
                <Skeleton className="h-[250px] w-full" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

interface DashboardState {
  result: DoctorDashboardResult | null
  series: DoctorDashboardSeries | null
  anomalies: AnomalyAlertRecord[]
  efficiency: AppointmentEfficiencyResult | null
  error: string | null
}

function bundleToState(bundle: AnalyticsDashboardBundle): DashboardState {
  // Summary cards are the core of the page -- a failure here is fatal.
  if (!bundle.data.success) {
    return { result: null, series: null, anomalies: [], efficiency: null, error: bundle.data.error }
  }

  // Charts, alerts, and efficiency all degrade gracefully -- the cards
  // still work without them.
  if (!bundle.series.success) {
    console.error('[AnalyticsDashboardContainer] series failed:', bundle.series.error)
  }
  if (!bundle.anomalies.success) {
    console.error('[AnalyticsDashboardContainer] anomalies failed:', bundle.anomalies.error)
  }
  if (!bundle.efficiency.success) {
    console.error('[AnalyticsDashboardContainer] efficiency failed:', bundle.efficiency.error)
  }

  return {
    result: bundle.data.data,
    series: bundle.series.success ? bundle.series.data : null,
    anomalies: bundle.anomalies.success ? bundle.anomalies.data : [],
    efficiency: bundle.efficiency.success ? bundle.efficiency.data : null,
    error: null,
  }
}

interface AnalyticsDashboardContainerProps {
  initialData: AnalyticsDashboardBundle
  initialFilter: DateRangeFilterInput
}

export default function AnalyticsDashboardContainer({
  initialData,
  initialFilter,
}: AnalyticsDashboardContainerProps) {
  const [state, setState] = useState<DashboardState>(() => bundleToState(initialData))
  const [loading, setLoading] = useState(false)
  const [currentFilter, setCurrentFilter] = useState<DateRangeFilterInput>(initialFilter)

  const [isRollupPending, startRollupTransition] = useTransition()
  const [rollupMessage, setRollupMessage] = useState<string | null>(null)

  const load = useCallback(async (filter: DateRangeFilterInput) => {
    setLoading(true)
    const bundle = await getAnalyticsDashboardBundle(filter)
    setState(bundleToState(bundle))
    setLoading(false)
  }, [])

  const handleRangeChange = (range: { preset: string; start?: string; end?: string }) => {
    const value = PRESET_LABEL_TO_VALUE[range.preset] ?? 'this_month'
    const filter: DateRangeFilterInput =
      value === 'custom'
        ? { preset: 'custom', startDate: range.start, endDate: range.end }
        : { preset: value }
    setCurrentFilter(filter)
    load(filter)
  }

  const handleRunRollup = () => {
    startRollupTransition(async () => {
      const res = await runDailyRollup()
      if (res.success) {
        setRollupMessage(
          `Rolled up ${res.data.date} — ${res.data.alertsTriggered} alert(s) triggered.`,
        )
        await load(currentFilter)
      } else {
        setRollupMessage(res.error)
      }
    })
  }

  if (loading && !state.result) {
    return <AnalyticsDashboardSkeleton />
  }

  if (state.error) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <p className="text-sm text-destructive">{state.error}</p>
      </div>
    )
  }

  return (
    <AnalyticsDashboard
      anomalies={state.anomalies.map(toBannerAnomaly)}
      income={state.result?.income}
      activity={state.result?.activity}
      revenueSeries={
        state.series?.revenueSeries.map((p) => ({ date: p.date, revenuePaise: p.value })) ?? []
      }
      appointmentsSeries={state.series?.appointmentsSeries ?? []}
      registrationsSeries={
        state.series?.registrationsSeries.map((p) => ({ date: p.date, count: p.value })) ?? []
      }
      busiestDays={state.series?.busiestDays ?? []}
      appointmentEfficiency={state.efficiency ?? undefined}
      onRangeChange={handleRangeChange}
      onRunRollup={handleRunRollup}
      isRollupPending={isRollupPending}
      rollupMessage={rollupMessage}
    />
  )
}