// src/features/analytics/actions.ts
//
// Doctor-only descriptive analytics (Chat 13) + predictive alerts data
// layer (Chat 14). Several genuinely different things live here:
//   - getDoctorDashboardData: a LIVE query against appointments/payments/
//     payment_collections/patients for whatever date range the doctor has
//     selected. This is what the summary cards render — always accurate,
//     works with an arbitrary custom range, no dependency on the rollup
//     having run.
//   - getDoctorDashboardSeries / getDoctorAnomalyAlerts: read from
//     daily_metrics / anomaly_alerts instead of live tables — these feed
//     the charts and alert banners, and only reflect days the rollup has
//     actually processed. A live per-day scan across a 90-day range would
//     be needlessly expensive; daily_metrics exists specifically so this
//     doesn't have to happen.
//   - runDailyRollup: writes ONE day's numbers into daily_metrics, then
//     runs deterministic statistical anomaly detection (rolling mean /
//     std-dev — NOT AI) against that day's appointment/no-show/revenue
//     counts.
//
// Everything here is requireRole('doctor') only — no 'staff' — matching
// the original brief exactly. Every query is additionally scoped to
// doctor_id = profile.id; there is no clinic-wide view here.
//
// IMPORTANT LIMITATION: runDailyRollup is user-invoked and scoped to
// whichever doctor calls it (correct for today's manual-trigger button).
// A real cron job has no logged-in user — when pg_cron is wired up at
// deploy time, it needs a separate, privileged version of this logic
// that loops every doctor in every clinic, not this one, called once.

'use server'

import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/supabase/profile'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { dateRangeFilterSchema } from './schema'
import { resolveDateRange, istRangeBounds, todayIST } from './date-utils'
import type {
  DailyMetricRecord,
  DoctorDashboardResult,
  DoctorDashboardSeries,
  IncomeSummary,
  ActivitySummary,
  AnomalyMetricName,
  AnomalyDirection,
  AnomalyAlertRecord,
  TimeSeriesPoint,
} from './types'

type Result<T> =
  | { success: true; data: T }
  | { success: false; error: string }

/**
 * daily_metrics' uniqueness is enforced by two PARTIAL unique indexes (a
 * doctor-scoped one and a future clinic-wide one), and Supabase's
 * .upsert({ onConflict }) can only emit "ON CONFLICT (columns)" with no
 * WHERE clause — which Postgres refuses to match against a partial index.
 * A plain .upsert() here would insert fine once, then fail every time the
 * same day is rolled up again. This does an explicit find-then-write
 * instead. There's a small race window if two writers hit the same
 * (clinic, doctor, day) at once, but this only ever runs from a manual
 * button click today, and a single daily cron job later — never
 * concurrent writers in practice.
 */
async function upsertDailyMetric(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  row: Omit<DailyMetricRecord, 'id' | 'created_at' | 'updated_at'>,
) {
  const { data: existing, error: findError } = await supabase
    .from('daily_metrics')
    .select('id')
    .eq('clinic_id', row.clinic_id)
    .eq('doctor_id', row.doctor_id)
    .eq('metric_date', row.metric_date)
    .maybeSingle()

  if (findError) throw findError

  const withTimestamp = { ...row, updated_at: new Date().toISOString() }

  if (existing) {
    const { error } = await supabase
      .from('daily_metrics')
      .update(withTimestamp)
      .eq('id', existing.id)
    if (error) throw error
  } else {
    const { error } = await supabase.from('daily_metrics').insert(withTimestamp)
    if (error) throw error
  }
}

// ── Dashboard read (summary cards) ──────────────────────────────────────────

export async function getDoctorDashboardData(rawFilter: unknown): Promise<Result<DoctorDashboardResult>> {
  try {
    const profile = await requireRole('doctor')

    const parsed = dateRangeFilterSchema.safeParse(rawFilter)
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? 'Invalid date range.'
      return { success: false, error: message }
    }

    const { startDate, endDate } = resolveDateRange(parsed.data)
    const { startBound, endExclusive } = istRangeBounds(startDate, endDate)

    const supabase = createServerSupabaseClient()

    const [
      { data: appts, error: apptErr },
      { data: payments, error: payErr },
      { data: collections, error: colErr },
      { data: newPatients, error: patErr },
      { data: outstandingRows, error: outErr },
    ] = await Promise.all([
      supabase
        .from('appointments')
        .select('id, status, patient_id')
        .eq('clinic_id', profile.clinic_id)
        .eq('doctor_id', profile.id)
        .is('deleted_at', null)
        .gte('appointment_date', startBound)
        .lt('appointment_date', endExclusive),
      supabase
        .from('payments')
        .select('id, amount_charged, approval_status')
        .eq('clinic_id', profile.clinic_id)
        .eq('doctor_id', profile.id)
        .gte('created_at', startBound)
        .lt('created_at', endExclusive),
      supabase
        .from('payment_collections')
        .select('amount_collected')
        .eq('clinic_id', profile.clinic_id)
        .eq('doctor_id', profile.id)
        .gte('collection_date', startBound)
        .lt('collection_date', endExclusive),
      supabase
        .from('patients')
        .select('id')
        .eq('clinic_id', profile.clinic_id)
        .eq('assigned_doctor_id', profile.id)
        .is('deleted_at', null)
        .gte('created_at', startBound)
        .lt('created_at', endExclusive),
      // Outstanding balance is a LIVE snapshot, not scoped to the date
      // range — see IncomeSummary.outstandingBalancePaise's doc comment
      // in types.ts for why summing it across days would double-count.
      supabase
        .from('payments')
        .select('outstanding_balance')
        .eq('clinic_id', profile.clinic_id)
        .eq('doctor_id', profile.id)
        .eq('approval_status', 'approved')
        .in('payment_status', ['unpaid', 'partial']),
    ])

    if (apptErr) throw apptErr
    if (payErr) throw payErr
    if (colErr) throw colErr
    if (patErr) throw patErr
    if (outErr) throw outErr

    const apptRows = appts ?? []
    const payRows = payments ?? []
    const collectionRows = collections ?? []

    const completedAppts = apptRows.filter((a) => a.status === 'completed')
    const cancelledCount = apptRows.filter((a) => a.status === 'cancelled').length
    const noShowCount = apptRows.filter((a) => a.status === 'no_show').length
    const totalAppts = apptRows.length

    const approvedCharges = payRows.filter((p) => p.approval_status === 'approved')
    const pendingCharges = payRows.filter((p) => p.approval_status === 'pending')

    const sumPaise = (values: number[]) =>
      Math.round(values.reduce((total, v) => total + (v || 0), 0) * 100)

    const income: IncomeSummary = {
      revenuePaise: sumPaise(collectionRows.map((c) => c.amount_collected)),
      averageConsultationFeePaise:
        payRows.length > 0
          ? Math.round(
              (payRows.reduce((total, p) => total + (p.amount_charged || 0), 0) /
                payRows.length) *
                100,
            )
          : 0,
      approvedAmountPaise: sumPaise(approvedCharges.map((p) => p.amount_charged)),
      pendingApprovalAmountPaise: sumPaise(pendingCharges.map((p) => p.amount_charged)),
      outstandingBalancePaise: sumPaise((outstandingRows ?? []).map((p) => p.outstanding_balance)),
    }

    const activity: ActivitySummary = {
      patientsSeen: new Set(completedAppts.map((a) => a.patient_id)).size,
      appointmentsTotal: totalAppts,
      appointmentsCompleted: completedAppts.length,
      appointmentsCancelled: cancelledCount,
      appointmentsNoShow: noShowCount,
      cancellationRate: totalAppts > 0 ? (cancelledCount + noShowCount) / totalAppts : 0,
      newRegistrations: (newPatients ?? []).length,
    }

    return { success: true, data: { startDate, endDate, income, activity } }
  } catch (err) {
    console.error('[getDoctorDashboardData]', err)
    return { success: false, error: 'Failed to load dashboard data.' }
  }
}

// ── Chart series read (from daily_metrics, not live tables) ────────────────

export async function getDoctorDashboardSeries(rawFilter: unknown): Promise<Result<DoctorDashboardSeries>> {
  try {
    const profile = await requireRole('doctor')

    const parsed = dateRangeFilterSchema.safeParse(rawFilter)
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? 'Invalid date range.'
      return { success: false, error: message }
    }

    const { startDate, endDate } = resolveDateRange(parsed.data)
    const supabase = createServerSupabaseClient()

    const { data, error } = await supabase
      .from('daily_metrics')
      .select(
        'metric_date, appointments_total, appointments_completed, appointments_cancelled, appointments_no_show, new_registrations, revenue_collected',
      )
      .eq('clinic_id', profile.clinic_id)
      .eq('doctor_id', profile.id)
      .gte('metric_date', startDate)
      .lte('metric_date', endDate)
      .order('metric_date', { ascending: true })

    if (error) throw error

    const rows = data ?? []

    const revenueSeries: TimeSeriesPoint[] = rows.map((r) => ({
      date: r.metric_date,
      value: Math.round((r.revenue_collected || 0) * 100),
    }))

    const appointmentsSeries = rows.map((r) => ({
      date: r.metric_date,
      completed: r.appointments_completed || 0,
      cancelled: r.appointments_cancelled || 0,
      noShow: r.appointments_no_show || 0,
    }))

    const registrationsSeries: TimeSeriesPoint[] = rows.map((r) => ({
      date: r.metric_date,
      value: r.new_registrations || 0,
    }))

    // Busiest days = day-of-week aggregation, not specific dates (specific
    // dates would just duplicate the appointments-over-time chart's
    // X-axis). metric_date is a plain DATE with no timezone component, so
    // parsing it as UTC midnight and reading getUTCDay() is safe — there's
    // no offset to accidentally shift across, we're only ever asking "what
    // weekday was this calendar date".
    const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const MONDAY_FIRST_ORDER = [1, 2, 3, 4, 5, 6, 0]

    const totalsByWeekday = new Array(7).fill(0)
    for (const r of rows) {
      const dow = new Date(`${r.metric_date}T00:00:00Z`).getUTCDay()
      totalsByWeekday[dow] += r.appointments_total || 0
    }

    const busiestDays = MONDAY_FIRST_ORDER.map((dow) => ({
      day: WEEKDAY_LABELS[dow],
      count: totalsByWeekday[dow],
    }))

    return { success: true, data: { revenueSeries, appointmentsSeries, registrationsSeries, busiestDays } }
  } catch (err) {
    console.error('[getDoctorDashboardSeries]', err)
    return { success: false, error: 'Failed to load chart data.' }
  }
}

// ── Anomaly alerts read ──────────────────────────────────────────────────────

export async function getDoctorAnomalyAlerts(rawFilter: unknown): Promise<Result<AnomalyAlertRecord[]>> {
  try {
    const profile = await requireRole('doctor')

    const parsed = dateRangeFilterSchema.safeParse(rawFilter)
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? 'Invalid date range.'
      return { success: false, error: message }
    }

    const { startDate, endDate } = resolveDateRange(parsed.data)
    const supabase = createServerSupabaseClient()

    const { data, error } = await supabase
      .from('anomaly_alerts')
      .select('*')
      .eq('clinic_id', profile.clinic_id)
      .eq('doctor_id', profile.id)
      .eq('is_acknowledged', false)
      .gte('alert_date', startDate)
      .lte('alert_date', endDate)
      // Alphabetical ascending puts "critical" before "warning" (c < w) —
      // most urgent first. There's no dismiss UI yet, so is_acknowledged
      // is always false today; the filter above is forward-looking for
      // when that exists.
      .order('severity', { ascending: true })
      .order('alert_date', { ascending: false })

    if (error) throw error

    return { success: true, data: (data ?? []) as AnomalyAlertRecord[] }
  } catch (err) {
    console.error('[getDoctorAnomalyAlerts]', err)
    return { success: false, error: 'Failed to load alerts.' }
  }
}

// ── Anomaly detection ────────────────────────────────────────────────────────
// Deterministic statistics only — rolling mean / sample std-dev / z-score.
// No AI, no model calls. Runs as part of the daily rollup below.

const ANOMALY_WINDOW_DAYS = 14
const ANOMALY_MIN_HISTORY_DAYS = 7
const Z_WARNING = 2
const Z_CRITICAL = 3
const STDDEV_EPSILON = 0.01
const ZERO_VARIANCE_Z_CAP = 5

// CHAT 14 (Step 1a): appointments_no_show and revenue_collected added.
// evaluateAnomaliesForDay below is generic over AnomalyMetricName, so no
// other change to the detection logic itself was required for the two new
// metrics to start being checked.
const ANOMALY_METRICS: AnomalyMetricName[] = [
  'appointments_total',
  'appointments_cancelled',
  'appointments_no_show',
  'revenue_collected',
]

function computeStats(values: number[]): { mean: number; stddev: number } {
  const n = values.length
  const mean = values.reduce((sum, v) => sum + v, 0) / n
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (n - 1)
  return { mean, stddev: Math.sqrt(variance) }
}

async function clearAnomalyAlert(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  clinicId: string,
  doctorId: string,
  alertDate: string,
  metricName: AnomalyMetricName,
) {
  const { error } = await supabase
    .from('anomaly_alerts')
    .delete()
    .eq('clinic_id', clinicId)
    .eq('doctor_id', doctorId)
    .eq('alert_date', alertDate)
    .eq('metric_name', metricName)
  if (error) throw error
}

async function upsertAnomalyAlert(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  row: {
    clinic_id: string
    doctor_id: string
    alert_date: string
    metric_name: AnomalyMetricName
    actual_value: number
    rolling_mean: number
    rolling_stddev: number
    z_score: number
    direction: AnomalyDirection
    severity: 'warning' | 'critical'
  },
) {
  const { data: existing, error: findError } = await supabase
    .from('anomaly_alerts')
    .select('id')
    .eq('clinic_id', row.clinic_id)
    .eq('doctor_id', row.doctor_id)
    .eq('alert_date', row.alert_date)
    .eq('metric_name', row.metric_name)
    .maybeSingle()

  if (findError) throw findError

  if (existing) {
    // Recomputed value replaces the old one; is_acknowledged deliberately
    // left untouched — a doctor who already dismissed today's alert
    // shouldn't have it silently reappear just because the rollup re-ran.
    const { error } = await supabase
      .from('anomaly_alerts')
      .update({
        actual_value: row.actual_value,
        rolling_mean: row.rolling_mean,
        rolling_stddev: row.rolling_stddev,
        z_score: row.z_score,
        direction: row.direction,
        severity: row.severity,
      })
      .eq('id', existing.id)
    if (error) throw error
  } else {
    const { error } = await supabase.from('anomaly_alerts').insert(row)
    if (error) throw error
  }
}

/**
 * Evaluates all tracked metrics for one doctor's one day against their
 * own trailing history, writing or clearing anomaly_alerts rows as
 * appropriate. Returns the metric names that triggered an alert this run
 * (for the caller to report back, e.g. "2 anomalies detected").
 *
 * CHAT 14 (Step 1e): each metric's iteration is now wrapped in its own
 * try/catch. Previously a single metric throwing (e.g. the metric_name
 * CHECK constraint rejecting an unrecognized value before its migration
 * landed) silently aborted every metric after it in the ANOMALY_METRICS
 * array — appointments_no_show and revenue_collected both went missing
 * from a single failure on appointments_no_show. One metric failing now
 * only skips that metric; every other metric still gets evaluated.
 */
async function evaluateAnomaliesForDay(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  clinicId: string,
  doctorId: string,
  targetDate: string,
  todayValues: Record<AnomalyMetricName, number>,
): Promise<AnomalyMetricName[]> {
  const triggered: AnomalyMetricName[] = []

  for (const metric of ANOMALY_METRICS) {
    try {
      const { data, error } = await supabase
        .from('daily_metrics')
        .select(metric)
        .eq('clinic_id', clinicId)
        .eq('doctor_id', doctorId)
        .lt('metric_date', targetDate)
        .order('metric_date', { ascending: false })
        .limit(ANOMALY_WINDOW_DAYS)

      if (error) throw error

      const history = (data ?? []).map((row) => (row as Record<string, number>)[metric])

      if (history.length < ANOMALY_MIN_HISTORY_DAYS) {
        // Not enough history to mean anything yet — a new clinic's first
        // week shouldn't trigger false alarms against almost nothing.
        await clearAnomalyAlert(supabase, clinicId, doctorId, targetDate, metric)
        continue
      }

      const { mean, stddev } = computeStats(history)
      const actual = todayValues[metric]

      let zScore: number
      let direction: AnomalyDirection

      if (stddev < STDDEV_EPSILON) {
        // The last N days were (near-)identical. If today matches too,
        // there's nothing to flag. If today differs at all, that's a real
        // break from a genuinely constant pattern — flag it, with the
        // z-score capped rather than computed (dividing by ~0 would blow
        // up into a meaningless huge or infinite number).
        if (Math.abs(actual - mean) < STDDEV_EPSILON) {
          await clearAnomalyAlert(supabase, clinicId, doctorId, targetDate, metric)
          continue
        }
        direction = actual > mean ? 'high' : 'low'
        zScore = direction === 'high' ? ZERO_VARIANCE_Z_CAP : -ZERO_VARIANCE_Z_CAP
      } else {
        zScore = (actual - mean) / stddev
        direction = zScore >= 0 ? 'high' : 'low'
      }

      const absZ = Math.abs(zScore)

      if (absZ < Z_WARNING) {
        await clearAnomalyAlert(supabase, clinicId, doctorId, targetDate, metric)
        continue
      }

      const severity = absZ >= Z_CRITICAL ? 'critical' : 'warning'

      await upsertAnomalyAlert(supabase, {
        clinic_id: clinicId,
        doctor_id: doctorId,
        alert_date: targetDate,
        metric_name: metric,
        actual_value: actual,
        rolling_mean: mean,
        rolling_stddev: stddev,
        z_score: zScore,
        direction,
        severity,
      })

      triggered.push(metric)
    } catch (metricErr) {
      // Isolated per metric — one bad metric (constraint violation,
      // transient DB error) no longer takes its siblings down with it.
      console.error(`[evaluateAnomaliesForDay] Metric "${metric}" failed:`, metricErr)
    }
  }

  return triggered
}

// ── Daily rollup (Option B: manual trigger for now) ─────────────────────────

/**
 * Computes and stores one day's aggregates for the current doctor, then
 * runs anomaly detection against that day's appointment/no-show/revenue
 * counts.
 *
 * Defaults to today (IST) rather than yesterday: a manual, dev-time
 * trigger is most useful for immediately seeing today's activity
 * reflected. The real deploy-time cron job will call an equivalent,
 * privileged version of this for "yesterday", once a day has fully
 * closed out, across every doctor — not this one, user-scoped function.
 */
export async function runDailyRollup(
  dateStr?: string,
): Promise<Result<{ date: string; alertsTriggered: number }>> {
  try {
    const profile = await requireRole('doctor')

    const targetDate = dateStr ?? todayIST()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate) || Number.isNaN(Date.parse(targetDate))) {
      return { success: false, error: 'Invalid date.' }
    }

    const { startBound, endExclusive } = istRangeBounds(targetDate, targetDate)
    const supabase = createServerSupabaseClient()

    const [
      { data: appts, error: apptErr },
      { data: payments, error: payErr },
      { data: collections, error: colErr },
      { data: newPatients, error: patErr },
    ] = await Promise.all([
      supabase
        .from('appointments')
        .select('id, status, patient_id')
        .eq('clinic_id', profile.clinic_id)
        .eq('doctor_id', profile.id)
        .is('deleted_at', null)
        .gte('appointment_date', startBound)
        .lt('appointment_date', endExclusive),
      supabase
        .from('payments')
        .select('id, amount_charged, approval_status, outstanding_balance')
        .eq('clinic_id', profile.clinic_id)
        .eq('doctor_id', profile.id)
        .gte('created_at', startBound)
        .lt('created_at', endExclusive),
      supabase
        .from('payment_collections')
        .select('amount_collected')
        .eq('clinic_id', profile.clinic_id)
        .eq('doctor_id', profile.id)
        .gte('collection_date', startBound)
        .lt('collection_date', endExclusive),
      supabase
        .from('patients')
        .select('id')
        .eq('clinic_id', profile.clinic_id)
        .eq('assigned_doctor_id', profile.id)
        .is('deleted_at', null)
        .gte('created_at', startBound)
        .lt('created_at', endExclusive),
    ])

    if (apptErr) throw apptErr
    if (payErr) throw payErr
    if (colErr) throw colErr
    if (patErr) throw patErr

    const apptRows = appts ?? []
    const payRows = payments ?? []
    const collectionRows = collections ?? []

    const approvedCharges = payRows.filter((p) => p.approval_status === 'approved')
    const pendingCharges = payRows.filter((p) => p.approval_status === 'pending')

    const sum = (values: number[]) => values.reduce((total, v) => total + (v || 0), 0)

    const appointmentsTotal = apptRows.length
    const appointmentsCancelled = apptRows.filter((a) => a.status === 'cancelled').length
    const appointmentsNoShow = apptRows.filter((a) => a.status === 'no_show').length
    const revenueCollected = sum(collectionRows.map((c) => c.amount_collected))

    await upsertDailyMetric(supabase, {
      clinic_id: profile.clinic_id,
      doctor_id: profile.id,
      metric_date: targetDate,

      appointments_total: appointmentsTotal,
      appointments_completed: apptRows.filter((a) => a.status === 'completed').length,
      appointments_cancelled: appointmentsCancelled,
      appointments_no_show: appointmentsNoShow,
      patients_seen: new Set(
        apptRows.filter((a) => a.status === 'completed').map((a) => a.patient_id),
      ).size,
      new_registrations: (newPatients ?? []).length,

      payments_count: payRows.length,
      total_billed: sum(payRows.map((p) => p.amount_charged)),
      revenue_collected: revenueCollected,
      revenue_pending: sum(pendingCharges.map((p) => p.amount_charged)),
      outstanding_balance_new: sum(approvedCharges.map((p) => p.outstanding_balance)),
    })

    // Anomaly detection is a secondary enrichment on top of the metric
    // save above, not the primary contract of this function — a failure
    // here shouldn't make the whole rollup report as failed when the
    // day's actual numbers saved just fine. (This outer try/catch is a
    // second layer on top of Step 1e's per-metric isolation inside
    // evaluateAnomaliesForDay — that inner one keeps one bad metric from
    // blocking its siblings; this outer one keeps the whole detection
    // step, if it somehow throws before even reaching the loop, from
    // blocking the metric save that already succeeded.)
    let alertsTriggered = 0
    try {
      const triggered = await evaluateAnomaliesForDay(supabase, profile.clinic_id, profile.id, targetDate, {
        appointments_total: appointmentsTotal,
        appointments_cancelled: appointmentsCancelled,
        appointments_no_show: appointmentsNoShow,
        revenue_collected: revenueCollected,
      })
      alertsTriggered = triggered.length
    } catch (anomalyErr) {
      console.error('[runDailyRollup] Anomaly detection failed:', anomalyErr)
    }

    revalidatePath('/dashboard/analytics')

    return { success: true, data: { date: targetDate, alertsTriggered } }
  } catch (err) {
    console.error('[runDailyRollup]', err)
    return { success: false, error: 'Failed to compute daily metrics.' }
  }
}