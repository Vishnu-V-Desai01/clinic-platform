-- Migration: doctor_attribution_and_dashboard_metrics
-- Chat 13 — Doctor-only descriptive analytics dashboard + anomaly alerts
--
-- What this does:
--   1. Adds nullable doctor attribution to payments (doctor_id) and
--      patients (assigned_doctor_id), backfilled from appointment history
--      wherever that history exists.
--   2. Creates daily_metrics — one row per (clinic, doctor, day), read by
--      the dashboard (Step 5) and populated by a daily rollup (Step 6).
--   3. Creates anomaly_alerts — one row per triggered statistical alert
--      (rolling mean/std-dev on bookings and cancellations), populated by
--      the same scheduled job.
--
-- doctor_id is nullable on daily_metrics/anomaly_alerts on purpose: a real
-- doctor id is a per-doctor row; NULL is reserved for a future clinic-wide
-- row (the staff dashboard, a later chat). Two partial unique indexes on
-- each table enforce "one row per day" correctly for both cases, since
-- Postgres treats every NULL as distinct from every other NULL.
--
-- Additive only — no existing column, table, or constraint is altered
-- or dropped.

begin;

-- ============================================================
-- 1. Doctor attribution on existing tables (additive, nullable)
-- ============================================================

alter table payments
  add column doctor_id uuid references profiles(id) on delete set null;

alter table patients
  add column assigned_doctor_id uuid references profiles(id) on delete set null;

create index payments_doctor_id_idx on payments(doctor_id);
create index patients_assigned_doctor_id_idx on patients(assigned_doctor_id);

-- Backfill payments.doctor_id from the linked appointment, where one exists.
-- Manual charges (appointment_id IS NULL) are left NULL — no doctor to infer.
-- These show as "Unassigned" on the dashboard until the Step 3 form requires
-- a doctor on every new manual charge going forward.
update payments pay
set doctor_id = appt.doctor_id
from appointments appt
where pay.appointment_id = appt.id
  and pay.doctor_id is null;

-- Backfill patients.assigned_doctor_id from each patient's EARLIEST
-- appointment. DISTINCT ON + ORDER BY keeps only the first (by
-- appointment_date) row per patient.
update patients p
set assigned_doctor_id = earliest.doctor_id
from (
  select distinct on (patient_id)
    patient_id,
    doctor_id
  from appointments
  where deleted_at is null
  order by patient_id, appointment_date asc
) as earliest
where p.id = earliest.patient_id
  and p.assigned_doctor_id is null;

-- ============================================================
-- 2. daily_metrics — one row per (clinic, doctor, day)
-- ============================================================

create table daily_metrics (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id),
  doctor_id uuid references profiles(id) on delete set null,
  metric_date date not null,

  -- Activity (by appointments.appointment_date, IST calendar day)
  appointments_total int not null default 0,
  appointments_completed int not null default 0,
  appointments_cancelled int not null default 0,
  appointments_no_show int not null default 0,
  patients_seen int not null default 0,
  new_registrations int not null default 0,

  -- Income (by payments.created_at, IST calendar day)
  payments_count int not null default 0,
  total_billed numeric not null default 0,
  revenue_collected numeric not null default 0,
  revenue_pending numeric not null default 0,
  outstanding_balance_new numeric not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Two partial indexes instead of one plain UNIQUE(clinic_id, doctor_id,
-- metric_date): a plain unique constraint would let unlimited duplicate
-- "clinic-wide" (doctor_id IS NULL) rows through for the same day, since
-- Postgres never considers two NULLs equal.
create unique index daily_metrics_doctor_day_uidx
  on daily_metrics (clinic_id, doctor_id, metric_date)
  where doctor_id is not null;

create unique index daily_metrics_clinic_day_uidx
  on daily_metrics (clinic_id, metric_date)
  where doctor_id is null;

create index daily_metrics_lookup_idx
  on daily_metrics (clinic_id, doctor_id, metric_date desc);

alter table daily_metrics enable row level security;

create policy daily_metrics_select
  on daily_metrics for select
  using (clinic_id = get_my_clinic_id());

-- No insert/update/delete policy for the authenticated role: this table is
-- only ever written by the rollup job (Step 6), which runs through a
-- privileged path, not a regular user session.

-- ============================================================
-- 3. anomaly_alerts — one row per triggered alert
-- ============================================================

create table anomaly_alerts (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id),
  doctor_id uuid references profiles(id) on delete set null,
  alert_date date not null,
  metric_name text not null check (metric_name in ('appointments_total', 'appointments_cancelled')),
  actual_value numeric not null,
  rolling_mean numeric not null,
  rolling_stddev numeric not null,
  z_score numeric not null,
  direction text not null check (direction in ('high', 'low')),
  severity text not null check (severity in ('warning', 'critical')),
  is_acknowledged boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index anomaly_alerts_doctor_uidx
  on anomaly_alerts (clinic_id, doctor_id, alert_date, metric_name)
  where doctor_id is not null;

create unique index anomaly_alerts_clinic_uidx
  on anomaly_alerts (clinic_id, alert_date, metric_name)
  where doctor_id is null;

alter table anomaly_alerts enable row level security;

create policy anomaly_alerts_select
  on anomaly_alerts for select
  using (clinic_id = get_my_clinic_id());

commit;