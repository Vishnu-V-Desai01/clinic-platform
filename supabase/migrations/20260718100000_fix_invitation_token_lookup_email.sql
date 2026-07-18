BEGIN;

-- CREATE OR REPLACE cannot change a function's return type.
-- Must DROP and recreate when adding the invited_email column.
DROP FUNCTION IF EXISTS public.get_invitation_by_token(text);

CREATE FUNCTION public.get_invitation_by_token(p_token text)
RETURNS TABLE (
  clinic_name text,
  role text,
  staff_type text,
  status text,
  expires_at timestamptz,
  invited_email text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT c.name, i.role, i.staff_type, i.status, i.expires_at, i.email
  FROM invitations i
  JOIN clinics c ON c.id = i.clinic_id
  WHERE i.token = p_token
$function$;

GRANT EXECUTE ON FUNCTION public.get_invitation_by_token(text) TO anon, authenticated;

COMMIT;