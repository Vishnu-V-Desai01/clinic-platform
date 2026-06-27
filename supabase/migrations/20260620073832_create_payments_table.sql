-- ============================================================================
-- Chat 10: Payments feature — create payments table + auto-creation trigger
-- ============================================================================

-- A. Create the payments table
-- One row per appointment charge; amount_paid is cumulative via payment_collections.
CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  patient_id uuid NOT NULL REFERENCES patients(id),
  appointment_id uuid NOT NULL REFERENCES appointments(id),
  
  -- Charge details (set by doctor when appointment is completed)
  amount_charged numeric(10, 2) NOT NULL CHECK (amount_charged > 0),
  amount_paid numeric(10, 2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  
  -- Generated column: outstanding balance (deterministic, always in sync)
  outstanding_balance numeric(10, 2) GENERATED ALWAYS AS (amount_charged - amount_paid) STORED,
  
  -- Generated column: payment status (deterministic, derived from amounts)
  payment_status text GENERATED ALWAYS AS (
    CASE
      WHEN amount_paid >= amount_charged THEN 'paid'
      WHEN amount_paid > 0 THEN 'partial'
      ELSE 'unpaid'
    END
  ) STORED,
  
  -- Doctor approval gate (separate from payment collection state)
  approval_status text NOT NULL DEFAULT 'pending'
    CHECK (approval_status IN ('pending', 'approved', 'rejected', 'void')),
  approved_by uuid REFERENCES profiles(id),
  approved_at timestamptz,
  approval_notes text,
  
  -- Reconciliation: flag overdue unpaid/partial payments (> 30 days old)
  -- Regular column, maintained by trigger (cannot be generated due to now() immutability)
  is_overdue boolean NOT NULL DEFAULT false,
  
  -- Audit trail
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES profiles(id),
  
  -- Constraints
  CONSTRAINT unique_payment_per_appointment UNIQUE (appointment_id, clinic_id)
);

-- B. Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_payments_clinic_patient 
  ON payments(clinic_id, patient_id);

CREATE INDEX IF NOT EXISTS idx_payments_approval_status 
  ON payments(clinic_id, approval_status);

CREATE INDEX IF NOT EXISTS idx_payments_is_overdue 
  ON payments(clinic_id, is_overdue) WHERE is_overdue = true;

CREATE INDEX IF NOT EXISTS idx_payments_appointment_id 
  ON payments(appointment_id);

-- C. Enable RLS on payments table
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- D. RLS Policies: doctors and staff can read/write payments for their clinic
DROP POLICY IF EXISTS "payments_select_clinic_staff_doctor" ON payments;
CREATE POLICY "payments_select_clinic_staff_doctor" ON payments
  FOR SELECT TO authenticated
  USING (
    clinic_id = get_my_clinic_id()
    AND get_my_role() IN ('doctor', 'staff')
  );

DROP POLICY IF EXISTS "payments_insert_clinic_staff_doctor" ON payments;
CREATE POLICY "payments_insert_clinic_staff_doctor" ON payments
  FOR INSERT TO authenticated
  WITH CHECK (
    clinic_id = get_my_clinic_id()
    AND get_my_role() IN ('doctor', 'staff')
  );

DROP POLICY IF EXISTS "payments_update_clinic_staff_doctor" ON payments;
CREATE POLICY "payments_update_clinic_staff_doctor" ON payments
  FOR UPDATE TO authenticated
  USING (
    clinic_id = get_my_clinic_id()
    AND get_my_role() IN ('doctor', 'staff')
  )
  WITH CHECK (
    clinic_id = get_my_clinic_id()
    AND get_my_role() IN ('doctor', 'staff')
  );

-- E. Trigger: auto-create a payment record when appointment status → 'completed'
-- The doctor will set the amount_charged via the approval action.
CREATE OR REPLACE FUNCTION trigger_create_payment_on_appointment_completed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only trigger on transition to 'completed'
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    -- Check if payment already exists (idempotency)
    INSERT INTO payments (
      clinic_id,
      patient_id,
      appointment_id,
      amount_charged,
      amount_paid,
      created_by,
      approval_status,
      is_overdue
    )
    VALUES (
      NEW.clinic_id,
      NEW.patient_id,
      NEW.id,
      0, -- Will be set by doctor in approval action
      0,
      NEW.doctor_id, -- Log the doctor who completed the appointment
      'pending',
      false -- Not overdue yet (just created)
    )
    ON CONFLICT (appointment_id, clinic_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_payment_on_appointment_completed ON appointments;
CREATE TRIGGER trg_create_payment_on_appointment_completed
  AFTER UPDATE ON appointments
  FOR EACH ROW
  EXECUTE FUNCTION trigger_create_payment_on_appointment_completed();

-- F. Function: recalculate is_overdue flag (called by trigger or manual refresh)
CREATE OR REPLACE FUNCTION fn_recalculate_payment_overdue_status(p_payment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE payments
  SET is_overdue = (amount_paid < amount_charged AND (now() - created_at) > INTERVAL '30 days')
  WHERE id = p_payment_id;
END;
$$;