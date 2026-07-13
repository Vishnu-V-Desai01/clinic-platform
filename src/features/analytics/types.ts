// src/features/analytics/types.ts
//
// Types for the doctor-only descriptive dashboard (Chat 13), predictive
// alerts (Chat 14 Step 1), and appointment efficiency (Chat 14 Step 2).
// DailyMetricRecord / AnomalyAlertRecord mirror the daily_metrics /
// anomaly_alerts tables exactly (see migration
// 20260707090000_doctor_attribution_and_dashboard_metrics.sql).
//
// doctor_id is nullable on both to match the DB: a real id is a per-doctor
// row, null is reserved for the future clinic-wide staff dashboard — this
// feature only ever queries/writes the per-doctor rows.

/* ------------------------- Database rows (snake_case) -------------------- */

export interface DailyMetricRecord {
  id: string
  clinic_id: string
  doctor_id: string | null
  metric_date: string // "YYYY-MM-DD"

  appointments_total: number
  appointments_completed: number
  appointments_cancelled: number
  appointments_no_show: number
  patients_seen: number
  new_registrations: number

  payments_count: number
  total_billed: number
  revenue_collected: number
  revenue_pending: number
  outstanding_balance_new: number

  created_at: string
  updated_at: string
}

// Extended for predictive alerts (Chat 14, Step 1a): appointments_no_show
// and revenue_collected join the original two. Widening this union is the
// only change needed to make evaluateAnomaliesForDay in actions.ts run
// the same rolling-mean/z-score check against them — that function is
// generic over AnomalyMetricName, not hardcoded to specific metrics.
export type AnomalyMetricName =
  | 'appointments_total'
  | 'appointments_cancelled'
  | 'appointments_no_show'
  | 'revenue_collected'

export type AnomalyDirection = 'high' | 'low'
export type AnomalySeverity = 'warning' | 'critical'

export interface AnomalyAlertRecord {
  id: string
  clinic_id: string
  doctor_id: string | null
  alert_date: string // "YYYY-MM-DD"
  metric_name: AnomalyMetricName
  actual_value: number
  rolling_mean: number
  rolling_stddev: number
  z_score: number
  direction: AnomalyDirection
  severity: AnomalySeverity
  is_acknowledged: boolean
  created_at: string
}

/* ------------------------------ Date ranges ------------------------------- */
// What the dashboard's filter bar works with. "custom" is the only preset
// that needs real start/end values from the user; the rest resolve to a
// concrete range server-side, in date-utils.ts.

export type DateRangePreset =
  | 'today'
  | 'this_week'
  | 'this_month'
  | 'last_30_days'
  | 'last_90_days'
  | 'custom'

export interface DateRangeFilter {
  preset: DateRangePreset
  startDate?: string // "YYYY-MM-DD", required when preset === "custom"
  endDate?: string    // "YYYY-MM-DD", required when preset === "custom"
}

/* ------------------------------ Display shapes ---------------------------- */
// What the dashboard actually renders. Populated by getDoctorDashboardData
// (summary cards, live query) and getDoctorDashboardSeries (charts, from
// daily_metrics rollup history) in actions.ts.

export interface IncomeSummary {
  revenuePaise: number
  averageConsultationFeePaise: number
  approvedAmountPaise: number
  pendingApprovalAmountPaise: number
  outstandingBalancePaise: number // live query against payments, not from daily_metrics — see prior note
}

export interface ActivitySummary {
  patientsSeen: number
  appointmentsTotal: number
  appointmentsCompleted: number
  appointmentsCancelled: number
  appointmentsNoShow: number
  cancellationRate: number // 0–1, (cancelled + no_show) / total, guarded against divide-by-zero
  newRegistrations: number
}

export interface TimeSeriesPoint {
  date: string // "YYYY-MM-DD"
  value: number
}

export interface DoctorDashboardResult {
  startDate: string
  endDate: string
  income: IncomeSummary
  activity: ActivitySummary
}

/* --------------------------- Chart series shapes -------------------------- */
// Sourced from daily_metrics, not live queries — see actions.ts comment on
// getDoctorDashboardSeries for why.

export interface AppointmentsSeriesPoint {
  date: string // "YYYY-MM-DD"
  completed: number
  cancelled: number
  noShow: number
}

export interface BusiestDayPoint {
  day: string // "Mon" .. "Sun"
  count: number
}

export interface DoctorDashboardSeries {
  revenueSeries: TimeSeriesPoint[]
  appointmentsSeries: AppointmentsSeriesPoint[]
  registrationsSeries: TimeSeriesPoint[]
  busiestDays: BusiestDayPoint[]
}

/* ----------------------- Appointment efficiency shapes -------------------- */
// Chat 14, Step 2. Live-queried from appointments directly (not
// daily_metrics) — this isn't pre-aggregated yet, and adding it to the
// rollup would be its own separate schema decision. Same LIVE-query
// pattern as getDoctorDashboardData: always accurate for an arbitrary
// custom range, no dependency on the rollup having run.
//
// Deliberately does NOT include "average consultation duration" or "slot
// utilization" — recon confirmed no real start/end time tracking and no
// slots table exist in this schema. duration_minutes exists but defaults
// to 30 and isn't reliably edited, so it's excluded rather than risk
// reporting a misleading average back to the doctor.

export interface CancellationReasonCount {
  reason: string // normalized (trimmed, lowercased-then-capitalized) — see actions.ts
  count: number
}

export interface BusiestHourPoint {
  hour: number // 0–23, IST
  label: string // e.g. "9 AM", "2 PM" — precomputed so the UI doesn't reformat
  count: number
}

export interface AppointmentEfficiencyResult {
  totalAppointments: number
  sameDayBookings: number
  advanceBookings: number
  sameDayBookingRate: number // 0–1
  repeatPatientAppointments: number
  newPatientAppointments: number
  repeatPatientRate: number // 0–1
  cancellationReasons: CancellationReasonCount[]
  busiestHours: BusiestHourPoint[]
}