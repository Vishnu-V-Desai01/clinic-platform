-- Chat 5: prepare the patients table for the Patient Registration feature.
-- Part A: add the columns the UI collects.
-- Part B: auto-generate the MRN.
-- Part C: replace the broken patient security rules (users/auth.uid) with
--         correct ones (profiles + Clerk).

-- ---------------------------------------------------------------------------
-- PART A: Add missing columns
-- ---------------------------------------------------------------------------

ALTER TABLE patients ADD COLUMN IF NOT EXISTS blood_group VARCHAR(5);
ALTER TABLE patients DROP CONSTRAINT IF EXISTS valid_blood_group;
ALTER TABLE patients ADD CONSTRAINT valid_blood_group
  CHECK (blood_group IS NULL OR blood_group IN ('A+','A-','B+','B-','AB+','AB-','O+','O-'));

-- Patient lifecycle status (Active / Inactive / Archived), stored lowercase
ALTER TABLE patients ADD COLUMN IF NOT EXISTS status VARCHAR(50) NOT NULL DEFAULT 'active';
ALTER TABLE patients DROP CONSTRAINT IF EXISTS valid_patient_status;
ALTER TABLE patients ADD CONSTRAINT valid_patient_status
  CHECK (status IN ('active','inactive','archived'));

-- Allergies and existing conditions (lists of short text tags)
ALTER TABLE patients ADD COLUMN IF NOT EXISTS allergies TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE patients ADD COLUMN IF NOT EXISTS conditions TEXT[] NOT NULL DEFAULT '{}';

-- Free-text clinical notes (optional)
ALTER TABLE patients ADD COLUMN IF NOT EXISTS notes TEXT;

-- Widen gender to match the form ("Prefer not to say")
ALTER TABLE patients DROP CONSTRAINT IF EXISTS valid_gender;
ALTER TABLE patients ADD CONSTRAINT valid_gender
  CHECK (gender IS NULL OR gender IN ('male','female','other','prefer_not_to_say'));

-- ---------------------------------------------------------------------------
-- PART B: Auto-generate the MRN  ->  CLI-<year>-<6 digits>, e.g. CLI-2026-000001
-- ---------------------------------------------------------------------------

CREATE SEQUENCE IF NOT EXISTS patient_mrn_seq;

ALTER TABLE patients
  ALTER COLUMN patient_id_number
  SET DEFAULT 'CLI-' || to_char(now(), 'YYYY') || '-' ||
              lpad(nextval('patient_mrn_seq')::text, 6, '0');

-- ---------------------------------------------------------------------------
-- PART C: Fix the patients security rules (RLS)
-- ---------------------------------------------------------------------------

-- Harden the helper functions so these lookups always work and are fast,
-- even when called from inside a policy. (Behaviour is unchanged: each one
-- still returns only the current logged-in user's own role / clinic.)
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM profiles WHERE clerk_user_id = (auth.jwt()->>'sub')
$$;

CREATE OR REPLACE FUNCTION get_my_clinic_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT clinic_id FROM profiles WHERE clerk_user_id = (auth.jwt()->>'sub')
$$;

-- Remove the old, broken patient policies
DROP POLICY IF EXISTS "staff_view_clinic_patients" ON patients;
DROP POLICY IF EXISTS "patient_view_own_record" ON patients;
DROP POLICY IF EXISTS "staff_insert_patients" ON patients;
DROP POLICY IF EXISTS "staff_update_patients" ON patients;

-- Doctors and staff can read all non-deleted patients in their own clinic
CREATE POLICY "staff_select_patients" ON patients
  FOR SELECT TO authenticated
  USING (
    clinic_id = get_my_clinic_id()
    AND get_my_role() IN ('doctor','staff')
    AND deleted_at IS NULL
  );

-- Doctors and staff can register new patients into their own clinic
CREATE POLICY "staff_insert_patients" ON patients
  FOR INSERT TO authenticated
  WITH CHECK (
    clinic_id = get_my_clinic_id()
    AND get_my_role() IN ('doctor','staff')
  );

-- Doctors and staff can update patients in their own clinic
CREATE POLICY "staff_update_patients" ON patients
  FOR UPDATE TO authenticated
  USING (
    clinic_id = get_my_clinic_id()
    AND get_my_role() IN ('doctor','staff')
  )
  WITH CHECK (
    clinic_id = get_my_clinic_id()
    AND get_my_role() IN ('doctor','staff')
  );

-- NOTE: We intentionally did NOT add a "patient can view their own record"
-- policy. The patients table has no link to a patient's login yet, so it
-- can't be written correctly. We'll add that (plus a link column) when we
-- build the patient portal in a later chat. For now, patients cannot read
-- this table — which is fine, since their portal doesn't exist yet.