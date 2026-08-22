BEGIN;

-- ============================================================
-- Portal helper functions (Chat 21)
--
-- Both functions are SECURITY DEFINER so they can join tables
-- (clinics, patients) that patients cannot SELECT directly
-- via RLS, while still scoping results to the caller's own
-- family account via get_my_family_account_id().
-- ============================================================

-- Returns the CRK-XXXXXX code + onboarding timestamp in one
-- round-trip. Layout calls this to decide whether to redirect
-- to /portal/welcome (null timestamp = first-time user).
CREATE OR REPLACE FUNCTION public.get_my_portal_status()
RETURNS TABLE (
  curakin_patient_code text,
  portal_onboarded_at  timestamptz
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT curakin_patient_code, portal_onboarded_at
  FROM   family_accounts
  WHERE  id = get_my_family_account_id()
$$;

GRANT EXECUTE ON FUNCTION public.get_my_portal_status() TO authenticated;

-- Returns all appointment requests for the current patient's
-- family, with clinic name and patient name joined safely.
-- Ordered newest-first so the UI can show them as-is.
CREATE OR REPLACE FUNCTION public.list_my_appointment_requests()
RETURNS TABLE (
  id                       uuid,
  patient_id               uuid,
  clinic_id                uuid,
  patient_first_name       character varying,
  patient_last_name        character varying,
  clinic_name              character varying,
  preferred_date           date,
  preferred_time_slot      text,
  reason                   text,
  status                   text,
  response_note            text,
  confirmed_appointment_id uuid,
  responded_at             timestamptz,
  created_at               timestamptz,
  updated_at               timestamptz
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    ar.id,
    ar.patient_id,
    ar.clinic_id,
    p.first_name,
    p.last_name,
    c.name,
    ar.preferred_date,
    ar.preferred_time_slot,
    ar.reason,
    ar.status,
    ar.response_note,
    ar.confirmed_appointment_id,
    ar.responded_at,
    ar.created_at,
    ar.updated_at
  FROM  appointment_requests ar
  JOIN  patients p ON p.id = ar.patient_id
  JOIN  clinics  c ON c.id = ar.clinic_id
  WHERE ar.family_account_id = get_my_family_account_id()
  ORDER BY ar.created_at DESC
$$;

GRANT EXECUTE ON FUNCTION public.list_my_appointment_requests() TO authenticated;

COMMIT;