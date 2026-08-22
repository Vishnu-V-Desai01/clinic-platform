BEGIN;

-- ============================================================
-- Patient portal: self-read RLS (Chat 21)
--
-- Patients (role='patient', clinic_id=NULL) currently cannot
-- read appointments, medical records, or payments — every
-- existing SELECT policy gates on get_my_clinic_id() match +
-- role IN ('doctor','staff'). This migration adds read-only
-- SELECT policies on all 7 tables using the family_account
-- link as the identity anchor.
--
-- Security model:
--   get_my_family_account_id() → current user's family UUID
--   Subquery returns only patient rows in that family.
--   Patient A satisfying Patient B's subquery is impossible
--   because get_my_family_account_id() is caller-scoped.
--
-- All policies are PERMISSIVE SELECT-only.
-- Patients have zero INSERT/UPDATE/DELETE access to any table.
-- ============================================================

-- Index guard: the subquery in every policy below joins
-- patients.family_account_id. Ensure the index exists
-- (was originally on patient_identity_id; IF NOT EXISTS
-- makes this safe to re-run regardless of prior state).
CREATE INDEX IF NOT EXISTS idx_patients_family_account_id
  ON patients(family_account_id);

-- ============================================================
-- Helper: return the CRK-XXXXXX code for the current patient.
-- Used by the portal home page to show + copy the Unique
-- Family ID without requiring direct family_accounts SELECT
-- access (avoids depending on the exact policy text there).
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_my_curakin_patient_code()
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT curakin_patient_code
  FROM family_accounts
  WHERE id = get_my_family_account_id()
$$;

GRANT EXECUTE ON FUNCTION public.get_my_curakin_patient_code() TO authenticated;

-- ============================================================
-- APPOINTMENTS
-- ============================================================
CREATE POLICY "appt_select_patient_own"
ON appointments
FOR SELECT TO authenticated
USING (
  get_my_role() = 'patient'
  AND patient_id IN (
    SELECT id FROM patients
    WHERE family_account_id = get_my_family_account_id()
      AND deleted_at IS NULL
  )
);

-- ============================================================
-- ENCOUNTERS
-- ============================================================
CREATE POLICY "encounters_select_patient_own"
ON encounters
FOR SELECT TO authenticated
USING (
  get_my_role() = 'patient'
  AND patient_id IN (
    SELECT id FROM patients
    WHERE family_account_id = get_my_family_account_id()
      AND deleted_at IS NULL
  )
);

-- ============================================================
-- DIAGNOSES
-- ============================================================
CREATE POLICY "diagnoses_select_patient_own"
ON diagnoses
FOR SELECT TO authenticated
USING (
  get_my_role() = 'patient'
  AND patient_id IN (
    SELECT id FROM patients
    WHERE family_account_id = get_my_family_account_id()
      AND deleted_at IS NULL
  )
);

-- ============================================================
-- OBSERVATIONS
-- ============================================================
CREATE POLICY "observations_select_patient_own"
ON observations
FOR SELECT TO authenticated
USING (
  get_my_role() = 'patient'
  AND patient_id IN (
    SELECT id FROM patients
    WHERE family_account_id = get_my_family_account_id()
      AND deleted_at IS NULL
  )
);

-- ============================================================
-- PRESCRIPTIONS
-- ============================================================
CREATE POLICY "prescriptions_select_patient_own"
ON prescriptions
FOR SELECT TO authenticated
USING (
  get_my_role() = 'patient'
  AND patient_id IN (
    SELECT id FROM patients
    WHERE family_account_id = get_my_family_account_id()
      AND deleted_at IS NULL
  )
);

-- ============================================================
-- TEST RESULTS
-- ============================================================
CREATE POLICY "test_results_select_patient_own"
ON test_results
FOR SELECT TO authenticated
USING (
  get_my_role() = 'patient'
  AND patient_id IN (
    SELECT id FROM patients
    WHERE family_account_id = get_my_family_account_id()
      AND deleted_at IS NULL
  )
);

-- ============================================================
-- PAYMENTS
-- ============================================================
CREATE POLICY "payments_select_patient_own"
ON payments
FOR SELECT TO authenticated
USING (
  get_my_role() = 'patient'
  AND patient_id IN (
    SELECT id FROM patients
    WHERE family_account_id = get_my_family_account_id()
      AND deleted_at IS NULL
  )
);

COMMIT;