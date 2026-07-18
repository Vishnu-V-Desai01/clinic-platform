BEGIN;

-- Lets a doctor resolve a family's "Unique Family ID" (shown on
-- their dashboard) to the internal UUID needed to create a request.
-- Returns only the UUID — no email, no patient list — so a bare
-- lookup can't leak anything about the family before they've
-- consented to anything.
CREATE OR REPLACE FUNCTION public.resolve_family_account_code(p_code text)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT id FROM family_accounts WHERE curakin_patient_code = p_code
$function$;

GRANT EXECUTE ON FUNCTION public.resolve_family_account_code(text) TO authenticated;

-- Lets a family account holder see enough about each request to
-- decide on it — requesting clinic + doctor's name — without
-- granting them broader visibility into the clinics/profiles
-- tables they otherwise have no access to at all.
CREATE OR REPLACE FUNCTION public.list_access_requests_for_my_family()
RETURNS TABLE (
  id uuid,
  requesting_clinic_name text,
  requesting_doctor_name text,
  request_note text,
  granted_patient_id uuid,
  status text,
  requested_at timestamptz,
  responded_at timestamptz,
  expires_at timestamptz
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    pag.id,
    c.name,
    p.full_name,
    pag.request_note,
    pag.granted_patient_id,
    pag.status,
    pag.requested_at,
    pag.responded_at,
    pag.expires_at
  FROM patient_access_grants pag
  JOIN clinics c ON c.id = pag.requesting_clinic_id
  JOIN profiles p ON p.id = pag.requesting_doctor_id
  WHERE pag.family_account_id = get_my_family_account_id()
  ORDER BY pag.requested_at DESC
$function$;

GRANT EXECUTE ON FUNCTION public.list_access_requests_for_my_family() TO authenticated;

-- Same reasoning, other direction: a family member needs to see
-- WHICH CLINIC each of their own cards belongs to (that's the whole
-- point of the dashboard), but patients_self_view_own_records only
-- grants raw row access — a plain nested join to clinics(name)
-- would silently return null, since clinic_members_select_own only
-- allows seeing your OWN clinic, and a patient's clinic_id is null.
CREATE OR REPLACE FUNCTION public.list_my_family_patient_cards()
RETURNS TABLE (
  id uuid,
  first_name character varying,
  last_name character varying,
  clinic_name character varying,
  created_at timestamptz
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT p.id, p.first_name, p.last_name, c.name, p.created_at
  FROM patients p
  JOIN clinics c ON c.id = p.clinic_id
  WHERE p.family_account_id = get_my_family_account_id()
    AND p.deleted_at IS NULL
  ORDER BY p.created_at DESC
$function$;

GRANT EXECUTE ON FUNCTION public.list_my_family_patient_cards() TO authenticated;

COMMIT;