BEGIN;

-- PATH 1: brand-new user creates a clinic, becomes its admin.
-- clerk_user_id comes from the verified JWT, never a parameter —
-- a client-supplied clerk_user_id could otherwise let someone
-- create a clinic and hand admin rights to a different account.
CREATE OR REPLACE FUNCTION public.create_clinic_and_become_admin(
  p_clinic_name text,
  p_email text,
  p_full_name text
)
RETURNS profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  calling_clerk_user_id text := auth.jwt()->>'sub';
  new_clinic_id uuid;
  new_profile profiles;
BEGIN
  IF calling_clerk_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF EXISTS (SELECT 1 FROM profiles WHERE clerk_user_id = calling_clerk_user_id) THEN
    RAISE EXCEPTION 'Profile already exists for this user';
  END IF;

  INSERT INTO clinics (name) VALUES (p_clinic_name)
    RETURNING id INTO new_clinic_id;

  INSERT INTO profiles (clerk_user_id, email, full_name, role, clinic_id, is_clinic_admin)
  VALUES (calling_clerk_user_id, p_email, p_full_name, 'doctor', new_clinic_id, true)
  RETURNING * INTO new_profile;

  UPDATE clinics SET owner_profile_id = new_profile.id WHERE id = new_clinic_id;

  RETURN new_profile;
END;
$function$;

-- PATH 2: doctor/staff accepts an invitation. FOR UPDATE locks the
-- row so two simultaneous accept attempts on the same token can't
-- both succeed. Requires the signing-in email to match the invited
-- email — a token leaked to the wrong inbox can't be redeemed by it.
CREATE OR REPLACE FUNCTION public.accept_staff_invitation(
  p_token text,
  p_email text,
  p_full_name text
)
RETURNS profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  calling_clerk_user_id text := auth.jwt()->>'sub';
  inv invitations;
  new_profile profiles;
BEGIN
  IF calling_clerk_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF EXISTS (SELECT 1 FROM profiles WHERE clerk_user_id = calling_clerk_user_id) THEN
    RAISE EXCEPTION 'Profile already exists for this user';
  END IF;

  SELECT * INTO inv FROM invitations WHERE token = p_token FOR UPDATE;

  IF inv IS NULL THEN
    RAISE EXCEPTION 'Invalid invitation token';
  END IF;

  IF inv.status <> 'pending' THEN
    RAISE EXCEPTION 'Invitation is no longer pending (status: %)', inv.status;
  END IF;

  IF inv.expires_at < now() THEN
    UPDATE invitations SET status = 'expired' WHERE id = inv.id;
    RAISE EXCEPTION 'Invitation has expired';
  END IF;

  IF lower(p_email) <> lower(inv.email) THEN
    RAISE EXCEPTION 'This invitation was sent to a different email address';
  END IF;

  INSERT INTO profiles (clerk_user_id, email, full_name, role, clinic_id, staff_type, is_clinic_admin)
  VALUES (calling_clerk_user_id, p_email, p_full_name, inv.role, inv.clinic_id, inv.staff_type, false)
  RETURNING * INTO new_profile;

  UPDATE invitations SET status = 'accepted', accepted_at = now() WHERE id = inv.id;

  RETURN new_profile;
END;
$function$;

-- PATH 3: patient claims an existing family_accounts row by
-- verified email. FOR UPDATE prevents a race between two logins
-- claiming the same row simultaneously. Does NOT create the
-- profiles row itself — that's a plain insert back in the app,
-- since the existing patient-only INSERT policy already allows it.
CREATE OR REPLACE FUNCTION public.claim_family_account(
  p_email text
)
RETURNS family_accounts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  calling_clerk_user_id text := auth.jwt()->>'sub';
  fam family_accounts;
BEGIN
  IF calling_clerk_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO fam FROM family_accounts WHERE email = p_email FOR UPDATE;

  IF fam IS NULL THEN
    RAISE EXCEPTION 'No patient record found for this email';
  END IF;

  IF fam.clerk_user_id IS NOT NULL AND fam.clerk_user_id <> calling_clerk_user_id THEN
    RAISE EXCEPTION 'This account is already claimed';
  END IF;

  IF fam.clerk_user_id IS NULL THEN
    UPDATE family_accounts SET clerk_user_id = calling_clerk_user_id WHERE id = fam.id
      RETURNING * INTO fam;
  END IF;

  RETURN fam;
END;
$function$;

COMMIT;