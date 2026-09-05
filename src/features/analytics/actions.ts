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
  AppointmentEfficiencyResult,
  CancellationReasonCount,
  BusiestHourPoint,
} from './types'

type Result<T> =
  | { success: true; data: T }
  | { success: false; error: string }

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

export async function getDoctorAnomalyAlerts(): Promise<Result<AnomalyAlertRecord[]>> {
  try {
    const profile = await requireRole('doctor')
    const supabase = createServerSupabaseClient()

    const today = todayIST()

    const { data, error } = await supabase
      .from('anomaly_alerts')
      .select('*')
      .eq('clinic_id', profile.clinic_id)
      .eq('doctor_id', profile.id)
      .eq('is_acknowledged', false)
      .eq('alert_date', today)
      .order('severity', { ascending: true })

    if (error) throw error

    return { success: true, data: (data ?? []) as AnomalyAlertRecord[] }
  } catch (err) {
    console.error('[getDoctorAnomalyAlerts]', err)
    return { success: false, error: 'Failed to load alerts.' }
  }
}

const ANOMALY_WINDOW_DAYS = 14
const ANOMALY_MIN_HISTORY_DAYS = 7
const Z_WARNING = 2
const Z_CRITICAL = 3
const STDDEV_EPSILON = 0.01
const ZERO_VARIANCE_Z_CAP = 5

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
        await clearAnomalyAlert(supabase, clinicId, doctorId, targetDate, metric)
        continue
      }

      const { mean, stddev } = computeStats(history)
      const actual = todayValues[metric]

      let zScore: number
      let direction: AnomalyDirection

      if (stddev < STDDEV_EPSILON) {
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
      console.error(`[evaluateAnomaliesForDay] Metric "${metric}" failed:`, metricErr)
    }
  }

  return triggered
}

export async function runDailyRollup(
  dateStr?: string,
): Promise<Result<{ date: string; alertsTriggered: number }>> {
  try {
    const profile = await requireRole('doctor')

    // clinic_id is nullable on Profile now (patients have none by design),
    // but requireRole('doctor') means role is never 'patient' here. A real
    // doctor always gets a clinic_id from createClinicAndBecomeAdmin or
    // acceptStaffInvitation. This guard makes the type error at upsertDailyMetric
    // (strict string field) and evaluateAnomaliesForDay (strict string parameter)
    // explicit rather than silently writing null into a row.
    if (!profile.clinic_id) {
      return { success: false, error: 'Your account is not associated with a clinic.' }
    }
    const clinicId = profile.clinic_id

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
        .eq('clinic_id', clinicId)
        .eq('doctor_id', profile.id)
        .is('deleted_at', null)
        .gte('appointment_date', startBound)
        .lt('appointment_date', endExclusive),
      supabase
        .from('payments')
        .select('id, amount_charged, approval_status, outstanding_balance')
        .eq('clinic_id', clinicId)
        .eq('doctor_id', profile.id)
        .gte('created_at', startBound)
        .lt('created_at', endExclusive),
      supabase
        .from('payment_collections')
        .select('amount_collected')
        .eq('clinic_id', clinicId)
        .eq('doctor_id', profile.id)
        .gte('collection_date', startBound)
        .lt('collection_date', endExclusive),
      supabase
        .from('patients')
        .select('id')
        .eq('clinic_id', clinicId)
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
      clinic_id: clinicId,
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

    let alertsTriggered = 0
    try {
      const triggered = await evaluateAnomaliesForDay(supabase, clinicId, profile.id, targetDate, {
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

function toISTDateString(isoTimestamp: string): string {
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000
  const ist = new Date(new Date(isoTimestamp).getTime() + IST_OFFSET_MS)
  return ist.toISOString().slice(0, 10)
}

function toISTHour(isoTimestamp: string): number {
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000
  const ist = new Date(new Date(isoTimestamp).getTime() + IST_OFFSET_MS)
  return ist.getUTCHours()
}

function formatHourLabel(hour: number): string {
  const period = hour < 12 ? 'AM' : 'PM'
  const displayHour = hour % 12 === 0 ? 12 : hour % 12
  return `${displayHour} ${period}`
}

export async function getAppointmentEfficiency(
  rawFilter: unknown,
): Promise<Result<AppointmentEfficiencyResult>> {
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

    const { data: rangeAppts, error: rangeErr } = await supabase
      .from('appointments')
      .select('id, patient_id, status, appointment_date, created_at, cancellation_reason')
      .eq('clinic_id', profile.clinic_id)
      .eq('doctor_id', profile.id)
      .is('deleted_at', null)
      .gte('appointment_date', startBound)
      .lt('appointment_date', endExclusive)

    if (rangeErr) throw rangeErr

    const appts = rangeAppts ?? []
    const totalAppointments = appts.length

    if (totalAppointments === 0) {
      return {
        success: true,
        data: {
          totalAppointments: 0,
          sameDayBookings: 0,
          advanceBookings: 0,
          sameDayBookingRate: 0,
          repeatPatientAppointments: 0,
          newPatientAppointments: 0,
          repeatPatientRate: 0,
          cancellationReasons: [],
          busiestHours: [],
        },
      }
    }

    let sameDayBookings = 0
    for (const a of appts) {
      if (!a.created_at) continue
      if (toISTDateString(a.created_at) === toISTDateString(a.appointment_date)) {
        sameDayBookings++
      }
    }
    const advanceBookings = totalAppointments - sameDayBookings

    const patientIds = Array.from(new Set(appts.map((a) => a.patient_id)))

    const { data: allTimeAppts, error: allTimeErr } = await supabase
      .from('appointments')
      .select('patient_id')
      .eq('clinic_id', profile.clinic_id)
      .eq('doctor_id', profile.id)
      .is('deleted_at', null)
      .in('patient_id', patientIds)

    if (allTimeErr) throw allTimeErr

    const allTimeCountByPatient = new Map<string, number>()
    for (const row of allTimeAppts ?? []) {
      allTimeCountByPatient.set(row.patient_id, (allTimeCountByPatient.get(row.patient_id) ?? 0) + 1)
    }

    let repeatPatientAppointments = 0
    for (const a of appts) {
      if ((allTimeCountByPatient.get(a.patient_id) ?? 0) > 1) {
        repeatPatientAppointments++
      }
    }
    const newPatientAppointments = totalAppointments - repeatPatientAppointments

    const reasonCounts = new Map<string, number>()
    for (const a of appts) {
      if (a.status !== 'cancelled') continue
      const raw = (a.cancellation_reason ?? '').trim()
      const key = raw.length > 0 ? raw.toLowerCase() : 'not specified'
      reasonCounts.set(key, (reasonCounts.get(key) ?? 0) + 1)
    }
    const cancellationReasons: CancellationReasonCount[] = Array.from(reasonCounts.entries())
      .map(([key, count]) => ({
        reason: key.charAt(0).toUpperCase() + key.slice(1),
        count,
      }))
      .sort((a, b) => b.count - a.count)

    const hourCounts = new Array(24).fill(0)
    for (const a of appts) {
      hourCounts[toISTHour(a.appointment_date)]++
    }
    const busiestHours: BusiestHourPoint[] = hourCounts
      .map((count, hour) => ({ hour, label: formatHourLabel(hour), count }))
      .filter((h) => h.count > 0)
      .sort((a, b) => a.hour - b.hour)

    return {
      success: true,
      data: {
        totalAppointments,
        sameDayBookings,
        advanceBookings,
        sameDayBookingRate: sameDayBookings / totalAppointments,
        repeatPatientAppointments,
        newPatientAppointments,
        repeatPatientRate: repeatPatientAppointments / totalAppointments,
        cancellationReasons,
        busiestHours,
      },
    }
  } catch (err) {
    console.error('[getAppointmentEfficiency]', err)
    return { success: false, error: 'Failed to load appointment efficiency data.' }
  }
}

export interface AnalyticsDashboardBundle {
  data: Result<DoctorDashboardResult>
  series: Result<DoctorDashboardSeries>
  anomalies: Result<AnomalyAlertRecord[]>
  efficiency: Result<AppointmentEfficiencyResult>
}

/**
 * Bundles all four analytics reads into a single Server Action.
 *
 * When called from the client container this collapses 4 sequential
 * client->server RPC round trips (each paying full network + auth
 * overhead) into 1. When called directly from a server component
 * (page.tsx) it costs nothing extra at all -- it's a plain in-process
 * function call. Query logic, RLS filtering, and per-branch error
 * handling are unchanged; this only changes where Promise.all runs.
 */
export async function getAnalyticsDashboardBundle(
  rawFilter: unknown,
): Promise<AnalyticsDashboardBundle> {
  const [data, series, anomalies, efficiency] = await Promise.all([
    getDoctorDashboardData(rawFilter),
    getDoctorDashboardSeries(rawFilter),
    getDoctorAnomalyAlerts(),
    getAppointmentEfficiency(rawFilter),
  ])

  return { data, series, anomalies, efficiency }
}