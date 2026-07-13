// src/features/analytics/components/analytics-dashboard-container.tsx
//
// Bridges the presentational AnalyticsDashboard (label-based range state,
// e.g. "This Week") and the backend (snake_case DateRangePreset values,
// e.g. "this_week"). Fetches all data sources in parallel on mount and on
// every range change.

'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import AnalyticsDashboard from './analytics-dashboard'
import {
  getDoctorDashboardData,
  getDoctorDashboardSeries,
  getDoctorAnomalyAlerts,
  getAppointmentEfficiency,
  runDailyRollup,
} from '../actions'
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

export default function AnalyticsDashboardContainer() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<DoctorDashboardResult | null>(null)
  const [series, setSeries] = useState<DoctorDashboardSeries | null>(null)
  const [anomalies, setAnomalies] = useState<AnomalyAlertRecord[]>([])
  const [efficiency, setEfficiency] = useState<AppointmentEfficiencyResult | null>(null)
  const [currentFilter, setCurrentFilter] = useState<DateRangeFilterInput>({ preset: 'this_month' })

  const [isRollupPending, startRollupTransition] = useTransition()
  const [rollupMessage, setRollupMessage] = useState<string | null>(null)

  const load = useCallback(async (filter: DateRangeFilterInput) => {
    setLoading(true)
    setError(null)

    const [dataRes, seriesRes, anomalyRes, efficiencyRes] = await Promise.all([
  getDoctorDashboardData(filter),
  getDoctorDashboardSeries(filter),
  getDoctorAnomalyAlerts(),
  getAppointmentEfficiency(filter),
])

    // Summary cards are the core of the page — a failure here is fatal.
    if (!dataRes.success) {
      setError(dataRes.error)
      setResult(null)
      setLoading(false)
      return
    }
    setResult(dataRes.data)

    // Charts, alerts, and efficiency all degrade gracefully — the cards
    // still work without them.
    if (seriesRes.success) {
      setSeries(seriesRes.data)
    } else {
      console.error('[AnalyticsDashboardContainer] series failed:', seriesRes.error)
      setSeries(null)
    }

    if (anomalyRes.success) {
      setAnomalies(anomalyRes.data)
    } else {
      console.error('[AnalyticsDashboardContainer] anomalies failed:', anomalyRes.error)
      setAnomalies([])
    }

    if (efficiencyRes.success) {
      setEfficiency(efficiencyRes.data)
    } else {
      console.error('[AnalyticsDashboardContainer] efficiency failed:', efficiencyRes.error)
      setEfficiency(null)
    }

    setLoading(false)
  }, [])

  // Initial load only — subsequent loads are triggered by handleRangeChange.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    load(currentFilter)
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

  if (loading && !result) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading analytics…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    )
  }

  return (
    <AnalyticsDashboard
      anomalies={anomalies.map(toBannerAnomaly)}
      income={result?.income}
      activity={result?.activity}
      revenueSeries={
        series?.revenueSeries.map((p) => ({ date: p.date, revenuePaise: p.value })) ?? []
      }
      appointmentsSeries={series?.appointmentsSeries ?? []}
      registrationsSeries={
        series?.registrationsSeries.map((p) => ({ date: p.date, count: p.value })) ?? []
      }
      busiestDays={series?.busiestDays ?? []}
      appointmentEfficiency={efficiency ?? undefined}
      onRangeChange={handleRangeChange}
      onRunRollup={handleRunRollup}
      isRollupPending={isRollupPending}
      rollupMessage={rollupMessage}
    />
  )
}