BEGIN;

-- ============================================================
-- Cross-clinic patient identity: one person, many clinic
-- enrollments. patients (Chat 5) is untouched in shape — still
-- one row per clinic — just gets a link to a shared identity.
-- ============================================================

CREATE SEQUENCE patient_identity_code_seq;

CREATE OR REPLACE FUNCTION generate_patient_identity_code()
RETURNS text
LANGUAGE sql
AS $$
  SELECT 'CRK-' || lpad(nextval('patient_identity_code_seq')::text, 6, '0');
$$;

CREATE TABLE patient_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  curakin_patient_code text NOT NULL UNIQUE DEFAULT generate_patient_identity_code(),
  clerk_user_id text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE patient_identities ENABLE ROW LEVEL SECURITY;

ALTER TABLE patients
  ADD COLUMN patient_identity_id uuid REFERENCES patient_identities(id);

CREATE INDEX idx_patients_patient_identity_id ON patients(patient_identity_id);

-- backfill: every existing patient row gets its own fresh identity
-- (no cross-clinic linkage exists today, so each row is treated
-- as a distinct person until proven otherwise via a real invite)
DO $$
DECLARE
  r RECORD;
  new_identity_id uuid;
BEGIN
  FOR r IN SELECT id FROM patients WHERE patient_identity_id IS NULL LOOP
    INSERT INTO patient_identities DEFAULT VALUES RETURNING id INTO new_identity_id;
    UPDATE patients SET patient_identity_id = new_identity_id WHERE id = r.id;
  END LOOP;
END $$;

-- helper function, same pattern as get_my_role() / get_my_clinic_id()
CREATE OR REPLACE FUNCTION public.get_my_patient_identity_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT id FROM patient_identities WHERE clerk_user_id = (auth.jwt()->>'sub')
$function$;

-- identities are never created by a direct client insert, same
-- pattern as clinic_insert_blocked — only via a SECURITY DEFINER
-- function during invite acceptance (Step 4)
CREATE POLICY patient_identities_insert_blocked
ON patient_identities
FOR INSERT
WITH CHECK (false);

CREATE POLICY patient_identities_view_own
ON patient_identities
FOR SELECT
USING (clerk_user_id = (auth.jwt()->>'sub'));

-- ============================================================
-- Extend invitations (Chat 18 Step 2) to cover patients, and to
-- optionally carry a known existing identity when a second
-- clinic invites someone already registered elsewhere.
-- ============================================================

ALTER TABLE invitations DROP CONSTRAINT invitations_role_check;
ALTER TABLE invitations ADD CONSTRAINT invitations_role_check
  CHECK (role IN ('doctor','staff','patient'));

ALTER TABLE invitations
  ADD COLUMN linked_patient_identity_id uuid REFERENCES patient_identities(id);

-- ============================================================
-- Temporary cross-clinic access requests: a doctor at a clinic
-- the patient isn't registered at asks to view their record
-- elsewhere; patient approves/denies/revokes.
-- ============================================================

CREATE TABLE patient_access_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_identity_id uuid NOT NULL REFERENCES patient_identities(id),
  target_clinic_id uuid NOT NULL REFERENCES clinics(id),
  requesting_clinic_id uuid NOT NULL REFERENCES clinics(id),
  requesting_doctor_id uuid NOT NULL REFERENCES profiles(id),
  status text NOT NULL DEFAULT 'pending'
    CONSTRAINT patient_access_grants_status_check
    CHECK (status IN ('pending','approved','denied','revoked','expired')),
  granted_scopes text[] NOT NULL DEFAULT '{}'::text[],
  requested_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  expires_at timestamptz,
  CONSTRAINT patient_access_grants_different_clinics
    CHECK (requesting_clinic_id <> target_clinic_id)
);

CREATE INDEX idx_pag_patient_identity_id ON patient_access_grants(patient_identity_id);
CREATE INDEX idx_pag_requesting_doctor_id ON patient_access_grants(requesting_doctor_id);

ALTER TABLE patient_access_grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY patient_access_grants_patient_view
ON patient_access_grants
FOR SELECT
USING (patient_identity_id = get_my_patient_identity_id());

CREATE POLICY patient_access_grants_patient_respond
ON patient_access_grants
FOR UPDATE
USING (patient_identity_id = get_my_patient_identity_id())
WITH CHECK (patient_identity_id = get_my_patient_identity_id());

CREATE POLICY patient_access_grants_doctor_view_own_requests
ON patient_access_grants
FOR SELECT
USING (
  requesting_doctor_id = (SELECT id FROM profiles WHERE clerk_user_id = (auth.jwt()->>'sub'))
);

CREATE POLICY patient_access_grants_doctor_request
ON patient_access_grants
FOR INSERT
WITH CHECK (
  get_my_role() = 'doctor'
  AND requesting_clinic_id = get_my_clinic_id()
  AND requesting_doctor_id = (SELECT id FROM profiles WHERE clerk_user_id = (auth.jwt()->>'sub'))
);

COMMIT;