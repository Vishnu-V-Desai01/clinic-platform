BEGIN;

-- ============================================================
-- Patient portal: extend self-read RLS + onboarding gate
-- (Chat 21)
--
-- Step 2 covered: appointments, encounters, diagnoses,
-- observations, prescriptions, test_results, payments.
-- This migration covers everything missed:
--   patient_consents (read + grant/revoke)
--   care_plans + all 4 child tables
--   payment_collections
-- Plus the onboarding gate column + completion function.
-- ============================================================

-- ============================================================
-- 1. Onboarding gate
-- NULL  → patient has never completed the welcome flow
--         → (patient)/layout.tsx redirects to /portal/welcome
-- SET   → full portal access
-- ============================================================
ALTER TABLE family_accounts
  ADD COLUMN IF NOT EXISTS portal_onboarded_at TIMESTAMPTZ;

COMMENT ON COLUMN family_accounts.portal_onboarded_at IS
  'Set once when the patient completes the portal welcome flow. '
  'NULL = first-time user; layout redirects to /portal/welcome.';

-- ============================================================
-- 2. complete_portal_onboarding()
-- SECURITY DEFINER so patients can mark themselves onboarded
-- without an UPDATE RLS policy on family_accounts (which
-- would expose email/curakin_patient_code to mutation).
-- Only touches portal_onboarded_at; no other column.
-- ============================================================
CREATE OR REPLACE FUNCTION public.complete_portal_onboarding()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  UPDATE family_accounts
  SET portal_onboarded_at = now()
  WHERE id = get_my_family_account_id()
    AND portal_onboarded_at IS NULL;
$$;

GRANT EXECUTE ON FUNCTION public.complete_portal_onboarding() TO authenticated;

-- ============================================================
-- 3. patient_consents — patient self-read
-- ============================================================
CREATE POLICY "patient_consents_select_patient_own"
ON patient_consents
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
-- 4. patient_consents — patient self-grant (INSERT)
-- Patients own their data under DPDP; they must be able to
-- grant consent themselves, not only via clinic staff.
-- granted_by will hold their own profiles.id.
-- ============================================================
CREATE POLICY "patient_consents_insert_patient_own"
ON patient_consents
FOR INSERT TO authenticated
WITH CHECK (
  get_my_role() = 'patient'
  AND patient_id IN (
    SELECT id FROM patients
    WHERE family_account_id = get_my_family_account_id()
      AND deleted_at IS NULL
  )
);

-- ============================================================
-- 5. patient_consents — patient self-revoke (UPDATE)
-- Revoke = set is_active=false in place (audit trail stays).
-- ============================================================
CREATE POLICY "patient_consents_update_patient_own"
ON patient_consents
FOR UPDATE TO authenticated
USING (
  get_my_role() = 'patient'
  AND patient_id IN (
    SELECT id FROM patients
    WHERE family_account_id = get_my_family_account_id()
      AND deleted_at IS NULL
  )
)
WITH CHECK (
  get_my_role() = 'patient'
  AND patient_id IN (
    SELECT id FROM patients
    WHERE family_account_id = get_my_family_account_id()
      AND deleted_at IS NULL
  )
);

-- ============================================================
-- 6. care_plans — patient self-read
-- care_plans has patient_id directly.
-- ============================================================
CREATE POLICY "care_plans_select_patient_own"
ON care_plans
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
-- 7. care_plan child tables — patient self-read
-- Child tables have care_plan_id but NOT patient_id, so the
-- subquery chains: care_plan_id → care_plans → patients.
-- ============================================================
CREATE POLICY "care_plan_medicines_select_patient_own"
ON care_plan_medicines
FOR SELECT TO authenticated
USING (
  get_my_role() = 'patient'
  AND care_plan_id IN (
    SELECT cp.id FROM care_plans cp
    WHERE cp.patient_id IN (
      SELECT id FROM patients
      WHERE family_account_id = get_my_family_account_id()
        AND deleted_at IS NULL
    )
  )
);

CREATE POLICY "care_plan_follow_ups_select_patient_own"
ON care_plan_follow_ups
FOR SELECT TO authenticated
USING (
  get_my_role() = 'patient'
  AND care_plan_id IN (
    SELECT cp.id FROM care_plans cp
    WHERE cp.patient_id IN (
      SELECT id FROM patients
      WHERE family_account_id = get_my_family_account_id()
        AND deleted_at IS NULL
    )
  )
);

CREATE POLICY "care_plan_suggestions_select_patient_own"
ON care_plan_suggestions
FOR SELECT TO authenticated
USING (
  get_my_role() = 'patient'
  AND care_plan_id IN (
    SELECT cp.id FROM care_plans cp
    WHERE cp.patient_id IN (
      SELECT id FROM patients
      WHERE family_account_id = get_my_family_account_id()
        AND deleted_at IS NULL
    )
  )
);

CREATE POLICY "care_plan_reminders_select_patient_own"
ON care_plan_reminders
FOR SELECT TO authenticated
USING (
  get_my_role() = 'patient'
  AND care_plan_id IN (
    SELECT cp.id FROM care_plans cp
    WHERE cp.patient_id IN (
      SELECT id FROM patients
      WHERE family_account_id = get_my_family_account_id()
        AND deleted_at IS NULL
    )
  )
);

-- ============================================================
-- 8. payment_collections — patient self-read
-- No patient_id on payment_collections; chains through
-- payments.patient_id → patients.family_account_id.
-- ============================================================
CREATE POLICY "payment_collections_select_patient_own"
ON payment_collections
FOR SELECT TO authenticated
USING (
  get_my_role() = 'patient'
  AND payment_id IN (
    SELECT py.id FROM payments py
    WHERE py.patient_id IN (
      SELECT id FROM patients
      WHERE family_account_id = get_my_family_account_id()
        AND deleted_at IS NULL
    )
  )
);

COMMIT;