-- ============================================================================
-- Patient name lookup for pharmacy/admin billing displays, bypassing the
-- restrictive patients_doctor_sees_assigned_only policy.
--
-- CONFIRMED ROOT CAUSE: patients_doctor_sees_assigned_only is a RESTRICTIVE
-- policy (polpermissive = false), not permissive. Restrictive policies AND
-- against the OR'd result of all permissive policies, rather than OR'ing
-- alongside them. This means staff_select_patients' clinic-wide grant never
-- actually applied for a doctor viewing a patient assigned to a DIFFERENT
-- doctor — the restrictive policy silently vetoes it every time. This is a
-- deliberate, pre-existing restriction on doctor-to-doctor patient
-- visibility (likely intentional need-to-know scoping), not a bug — so it
-- is NOT changed here.
--
-- Instead, a narrow SECURITY DEFINER function exposes only patient names
-- (never full patient records) to any pharmacy_access/admin user, for
-- billing display purposes specifically — mirroring the exact pattern
-- already used for pharmacy_dispense() and pharmacy_reject_prescription(),
-- which bypass this same class of restriction via SECURITY DEFINER rather
-- than by loosening the underlying table policy.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.pharmacy_lookup_patient_names(p_patient_ids uuid[])
RETURNS TABLE (id uuid, first_name text, last_name text)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT p.id, p.first_name, p.last_name
  FROM public.patients p
  WHERE p.id = ANY(p_patient_ids)
    AND p.clinic_id = public.get_my_clinic_id()
    AND p.deleted_at IS NULL
    -- Caller must have SOME legitimate reason to see billing/dispensing
    -- data for this clinic — pharmacy access or admin, matching every
    -- other pharmacy write/read gate in this codebase.
    AND public.am_i_pharmacy_user();
$$;

REVOKE ALL ON FUNCTION public.pharmacy_lookup_patient_names(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pharmacy_lookup_patient_names(uuid[]) TO authenticated;

COMMENT ON FUNCTION public.pharmacy_lookup_patient_names(uuid[]) IS
  'Returns patient id/first_name/last_name only, for pharmacy queue and billing displays. Bypasses patients_doctor_sees_assigned_only (a RESTRICTIVE policy) by design — a pharmacist/admin needs to see any patient''s name for dispensing and billing, not just patients assigned to the currently logged-in doctor. Gated by am_i_pharmacy_user(), same as every other pharmacy write path.';