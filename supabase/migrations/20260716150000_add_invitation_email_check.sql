BEGIN;

CREATE OR REPLACE FUNCTION public.check_invitation_email_status(p_email text)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM profiles WHERE lower(email) = lower(p_email) AND role IN ('doctor','staff')
    ) THEN 'available'
    WHEN EXISTS (
      SELECT 1 FROM profiles
      WHERE lower(email) = lower(p_email) AND role IN ('doctor','staff') AND clinic_id = get_my_clinic_id()
    ) THEN 'already_in_your_clinic'
    ELSE 'already_in_another_clinic'
  END
$function$;

COMMIT;