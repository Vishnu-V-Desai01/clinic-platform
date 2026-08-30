-- supabase/migrations/20260830140000_check_email_matches_patient.sql
--
-- Security hardening (payment-wall bypass fix): before / lets a
-- brand-new authenticated user create a clinic for free, it now checks
-- whether their verified email matches an existing patient record. If
-- so, they're a patient who reached the wrong page (e.g. a misrouted
-- sign-up redirect) — not someone legitimately setting up a clinic.
--
-- SECURITY DEFINER because the caller has no profile yet, so normal
-- patients RLS (clinic-staff-scoped, family-account-scoped) would
-- return nothing regardless of whether a match exists — that's correct
-- for ordinary reads, but wrong for this specific "does this email
-- belong to a patient at all" check. Returns a bare boolean only, so
-- it cannot leak any patient data even though it bypasses RLS.
CREATE OR REPLACE FUNCTION public.email_matches_existing_patient(
  p_email text
)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM patients
    WHERE email = p_email AND deleted_at IS NULL
  )
$function$;

GRANT EXECUTE ON FUNCTION public.email_matches_existing_patient(text) TO authenticated;