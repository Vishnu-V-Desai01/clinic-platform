-- ============================================================================
-- Chat 10: Payments feature — create payment_alerts table for reconciliation
-- ============================================================================

-- A. Create the payment_alerts table
-- Immutable snapshots of overdue/outstanding payments.
-- Generated deterministically by the reconciliation job; not editable by users.
CREATE TABLE IF NOT EXISTS payment_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  payment_id uuid NOT NULL REFERENCES payments(id),
  patient_id uuid NOT NULL REFERENCES patients(id),
  appointment_id uuid NOT NULL REFERENCES appointments(id),

  -- Snapshot of payment state at alert time
  amount_charged numeric(10, 2) NOT NULL,
  amount_paid numeric(10, 2) NOT NULL,
  outstanding_balance numeric(10, 2) NOT NULL,
  payment_status text NOT NULL CHECK (payment_status IN ('unpaid', 'partial', 'paid')),

  -- Alert classification (deterministic, rule-based)
  alert_type text NOT NULL CHECK (alert_type IN ('overdue_unpaid', 'overdue_partial')),
  days_overdue integer NOT NULL,
  escalation_level text NOT NULL CHECK (escalation_level IN ('warning', 'urgent')),
  -- warning: 30-60 days overdue
  -- urgent: > 60 days overdue

  -- Resolution tracking
  alert_created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz, -- NULL until payment is collected

  -- Constraints
  CONSTRAINT unique_unresolved_alert_per_payment UNIQUE NULLS NOT DISTINCT (payment_id, resolved_at)
);

-- B. Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_payment_alerts_clinic_unresolved
  ON payment_alerts(clinic_id, resolved_at) WHERE resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_payment_alerts_escalation_level
  ON payment_alerts(clinic_id, escalation_level) WHERE resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_payment_alerts_created_at
  ON payment_alerts(clinic_id, alert_created_at DESC);

-- C. Enable RLS on payment_alerts table
ALTER TABLE payment_alerts ENABLE ROW LEVEL SECURITY;

-- D. RLS Policies: doctors and staff can read alerts for their clinic
--    No INSERT/UPDATE/DELETE (reconciliation job writes via service role)
DROP POLICY IF EXISTS "payment_alerts_select_clinic_staff_doctor" ON payment_alerts;
CREATE POLICY "payment_alerts_select_clinic_staff_doctor" ON payment_alerts
  FOR SELECT TO authenticated
  USING (
    clinic_id = get_my_clinic_id()
    AND get_my_role() IN ('doctor', 'staff')
  );

-- NOTE: INSERT/UPDATE/DELETE policies intentionally omitted.
-- Alerts are created by the reconciliation cron job (via service role).
-- Users cannot manually create/edit alerts.