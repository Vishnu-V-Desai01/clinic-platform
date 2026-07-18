BEGIN;

CREATE OR REPLACE FUNCTION public.get_my_family_account_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT id FROM family_accounts WHERE clerk_user_id = (auth.jwt()->>'sub')
$function$;

COMMIT;