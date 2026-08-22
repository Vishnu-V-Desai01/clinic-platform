BEGIN;

-- ============================================================
-- appointment_requests (Chat 21)
--
-- Patients submit a request from the portal; clinic staff
-- confirm or reject it from the staff dashboard (Chat 22).
-- Confirmed requests link to the actual appointments row via
-- confirmed_appointment_id.
--
-- RLS model:
--   Patient  → INSERT own (pending only), SELECT own, UPDATE
--               own pending → cancelled only (DB-enforced)
--   Staff/Doctor → SELECT + UPDATE all in their clinic
-- ============================================================

CREATE TABLE appointment_requests (
  id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity anchors
  family_account_id         UUID        NOT NULL REFERENCES family_accounts(id),
  patient_id                UUID        NOT NULL REFERENCES patients(id),
  clinic_id                 UUID        NOT NULL REFERENCES clinics(id),

  -- What the patient wants
  preferred_date            DATE        NOT NULL,
  preferred_time_slot       TEXT
    CONSTRAINT appt_req_time_slot_check
    CHECK (preferred_time_slot IS NULL
      OR preferred_time_slot IN ('morning', 'afternoon', 'evening')),
  reason                    TEXT,

  -- Lifecycle
  status                    TEXT        NOT NULL DEFAULT 'pending'
    CONSTRAINT appt_req_status_check
    CHECK (status IN ('pending', 'confirmed', 'rejected', 'cancelled')),

  -- Staff response
  response_note             TEXT,
  confirmed_appointment_id  UUID        REFERENCES appointments(id),
  responded_by              UUID        REFERENCES profiles(id),
  responded_at              TIMESTAMPTZ,

  -- Audit
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- A confirmed request must reference an appointment row
  CONSTRAINT appt_req_confirmed_needs_appointment
    CHECK (
      status <> 'confirmed'
      OR confirmed_appointment_id IS NOT NULL
    )
);

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX idx_appt_req_family_account_id
  ON appointment_requests(family_account_id);

CREATE INDEX idx_appt_req_patient_id
  ON appointment_requests(patient_id);

CREATE INDEX idx_appt_req_clinic_status
  ON appointment_requests(clinic_id, status);

-- ============================================================
-- updated_at trigger
-- ============================================================
CREATE OR REPLACE FUNCTION update_appointment_requests_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_appt_req_updated_at
  BEFORE UPDATE ON appointment_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_appointment_requests_updated_at();

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE appointment_requests ENABLE ROW LEVEL SECURITY;

-- Patient: read own requests (any status)
CREATE POLICY "appt_req_select_patient_own"
ON appointment_requests
FOR SELECT TO authenticated
USING (
  get_my_role() = 'patient'
  AND family_account_id = get_my_family_account_id()
);

-- Patient: submit a new request
-- family_account_id and clinic_id are validated in the action;
-- status must start as 'pending' (DEFAULT handles it, WITH CHECK enforces it).
CREATE POLICY "appt_req_insert_patient_own"
ON appointment_requests
FOR INSERT TO authenticated
WITH CHECK (
  get_my_role() = 'patient'
  AND family_account_id = get_my_family_account_id()
  AND status = 'pending'
);

-- Patient: cancel own PENDING request only.
-- USING  → can only target rows that are still pending and belong to this family.
-- WITH CHECK → the new row must have status='cancelled'; nothing else changes.
CREATE POLICY "appt_req_cancel_patient_own"
ON appointment_requests
FOR UPDATE TO authenticated
USING (
  get_my_role() = 'patient'
  AND family_account_id = get_my_family_account_id()
  AND status = 'pending'
)
WITH CHECK (
  get_my_role() = 'patient'
  AND family_account_id = get_my_family_account_id()
  AND status = 'cancelled'
);

-- Staff/Doctor: read all requests for their clinic
CREATE POLICY "appt_req_select_clinic_staff_doctor"
ON appointment_requests
FOR SELECT TO authenticated
USING (
  clinic_id = get_my_clinic_id()
  AND get_my_role() IN ('doctor', 'staff')
);

-- Staff/Doctor: confirm or reject requests for their clinic
CREATE POLICY "appt_req_update_clinic_staff_doctor"
ON appointment_requests
FOR UPDATE TO authenticated
USING (
  clinic_id = get_my_clinic_id()
  AND get_my_role() IN ('doctor', 'staff')
)
WITH CHECK (
  clinic_id = get_my_clinic_id()
  AND get_my_role() IN ('doctor', 'staff')
);

COMMIT;