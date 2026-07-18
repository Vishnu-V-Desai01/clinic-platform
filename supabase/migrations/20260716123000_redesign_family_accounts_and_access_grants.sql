BEGIN;

-- ============================================================
-- Rename: this table was built assuming "one row = one person,
-- matched across clinics." The confirmed model groups clinic-
-- isolated patient cards under a shared FAMILY dashboard,
-- matched only by registration email — no per-person matching
-- happens anywhere.
-- ============================================================

ALTER TABLE patient_identities RENAME TO family_accounts;
ALTER TABLE patients RENAME COLUMN patient_identity_id TO family_account_id;
ALTER FUNCTION public.get_my_patient_identity_id() RENAME TO get_my_family_account_id;
ALTER POLICY patient_identities_view_own ON family_accounts RENAME TO family_accounts_view_own;
ALTER POLICY patient_identities_insert_blocked ON family_accounts RENAME TO family_accounts_insert_blocked;

ALTER TABLE family_accounts
  ADD COLUMN email character varying UNIQUE;

COMMENT ON TABLE family_accounts IS
  'One row per registration email. Groups clinic-isolated patient
   cards (patients rows) sharing that email into one family
   dashboard. Does not verify an actual person or relationship.';

COMMENT ON COLUMN family_accounts.curakin_patient_code IS
  'The "Unique Family ID" shown on the dashboard and given to
   other clinics/doctors requesting access.';

-- ============================================================
-- Auto-link every new patient card to a family account by email,
-- at the DB layer so it applies regardless of which code path
-- creates the row. Email stays optional — patients declining to
-- give one register exactly as Chat 5 already built, just with
-- no family linking. Race-safe via ON CONFLICT (Chat 9 pattern).
-- ============================================================

CREATE OR REPLACE FUNCTION link_patient_to_family_account()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  matched_family_id uuid;
BEGIN
  IF NEW.email IS NOT NULL AND NEW.family_account_id IS NULL THEN
    INSERT INTO family_accounts (email) VALUES (NEW.email)
      ON CONFLICT (email) DO NOTHING
      RETURNING id INTO matched_family_id;

    IF matched_family_id IS NULL THEN
      SELECT id INTO matched_family_id FROM family_accounts WHERE email = NEW.email;
    END IF;

    NEW.family_account_id := matched_family_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_link_patient_to_family_account
BEFORE INSERT ON patients
FOR EACH ROW
EXECUTE FUNCTION link_patient_to_family_account();

-- ============================================================
-- patient_access_grants: revised. A request targets a family
-- broadly; the family manager attaches a specific card only
-- when they respond. Dropping and recreating cleanly — nothing
-- app-level touches this table yet.
-- ============================================================

DROP POLICY IF EXISTS patients_cross_clinic_approved_access ON patients;
DROP TABLE IF EXISTS patient_access_grants;

CREATE TABLE patient_access_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_account_id uuid NOT NULL REFERENCES family_accounts(id),
  requesting_clinic_id uuid NOT NULL REFERENCES clinics(id),
  requesting_doctor_id uuid NOT NULL REFERENCES profiles(id),
  request_note text,
  granted_patient_id uuid REFERENCES patients(id),
  status text NOT NULL DEFAULT 'pending'
    CONSTRAINT patient_access_grants_status_check
    CHECK (status IN ('pending','approved','denied','revoked','expired')),
  granted_scopes text[] NOT NULL DEFAULT '{}'::text[],
  requested_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  expires_at timestamptz,
  CONSTRAINT patient_access_grants_card_requires_response
    CHECK (granted_patient_id IS NULL OR status IN ('approved','revoked','expired'))
);

CREATE INDEX idx_pag_family_account_id ON patient_access_grants(family_account_id);
CREATE INDEX idx_pag_requesting_doctor_id ON patient_access_grants(requesting_doctor_id);
CREATE INDEX idx_pag_granted_patient_id ON patient_access_grants(granted_patient_id);

ALTER TABLE patient_access_grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY patient_access_grants_family_view
ON patient_access_grants
FOR SELECT
USING (family_account_id = get_my_family_account_id());

CREATE POLICY patient_access_grants_family_respond
ON patient_access_grants
FOR UPDATE
USING (family_account_id = get_my_family_account_id())
WITH CHECK (
  family_account_id = get_my_family_account_id()
  AND (
    granted_patient_id IS NULL
    OR EXISTS (
      SELECT 1 FROM patients p
      WHERE p.id = granted_patient_id
        AND p.family_account_id = patient_access_grants.family_account_id
    )
  )
);

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
  AND granted_patient_id IS NULL
);

CREATE POLICY patients_cross_clinic_approved_access
ON patients
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM patient_access_grants pag
    WHERE pag.granted_patient_id = patients.id
      AND pag.requesting_doctor_id = (SELECT id FROM profiles WHERE clerk_user_id = (auth.jwt()->>'sub'))
      AND pag.status = 'approved'
      AND pag.expires_at > now()
  )
);

-- ============================================================
-- invitations: revert the patient-role expansion. Confirmed —
-- every clinic registers every patient the same way, via the
-- existing Chat 5 form. Invitations stay doctor/staff only.
-- ============================================================

ALTER TABLE invitations DROP CONSTRAINT invitations_role_check;
ALTER TABLE invitations ADD CONSTRAINT invitations_role_check
  CHECK (role IN ('doctor','staff'));

ALTER TABLE invitations DROP COLUMN IF EXISTS linked_patient_identity_id;

COMMIT;