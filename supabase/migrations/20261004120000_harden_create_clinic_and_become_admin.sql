-- Item 1 (step 2): harden create_clinic_and_become_admin at the database.
--
-- Additive: CREATE OR REPLACE on the existing 13-argument signature (same
-- signature = it replaces the live function, no new overload) plus REVOKEs.
-- Nothing is dropped.
--
-- New refusals, all inside the SECURITY DEFINER function itself:
--   * blank email or blank clinic name
--   * caller already holds a family-portal login (family_accounts.clerk_user_id)
--   * email matches a patient or family-account email (case-insensitive,
--     whitespace-trimmed) -- a patient must never become a clinic admin
-- Known remaining gap (Item 3): p_email is still caller-supplied. Closing it
-- needs an email claim in the Clerk session token.

CREATE OR REPLACE FUNCTION public.create_clinic_and_become_admin(
  p_clinic_name text,
  p_email text,
  p_full_name text,
  p_clinic_phone text DEFAULT NULL::text,
  p_clinic_contact_email text DEFAULT NULL::text,
  p_clinic_address text DEFAULT NULL::text,
  p_clinic_city text DEFAULT NULL::text,
  p_clinic_state text DEFAULT NULL::text,
  p_clinic_postal_code text DEFAULT NULL::text,
  p_clinic_license_number text DEFAULT NULL::text,
  p_clinic_gst_number text DEFAULT NULL::text,
  p_clinic_hfr_id text DEFAULT NULL::text,
  p_tos_version text DEFAULT NULL::text
)
RETURNS profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  calling_clerk_user_id text := auth.jwt()->>'sub';
  normalised_email text := lower(btrim(coalesce(p_email, '')));
  new_clinic_id uuid;
  new_profile profiles;
  trial_start timestamptz := now();
  trial_end timestamptz := now() + interval '14 days';
BEGIN
  IF calling_clerk_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF normalised_email = '' THEN
    RAISE EXCEPTION 'A verified email address is required';
  END IF;

  IF length(btrim(coalesce(p_clinic_name, ''))) < 2 THEN
    RAISE EXCEPTION 'Clinic name must be at least 2 characters';
  END IF;

  IF EXISTS (SELECT 1 FROM profiles WHERE clerk_user_id = calling_clerk_user_id) THEN
    RAISE EXCEPTION 'Profile already exists for this user';
  END IF;

  IF EXISTS (SELECT 1 FROM family_accounts WHERE clerk_user_id = calling_clerk_user_id) THEN
    RAISE EXCEPTION 'This account is linked to a patient record';
  END IF;

  IF EXISTS (
       SELECT 1 FROM patients
       WHERE lower(btrim(email)) = normalised_email AND deleted_at IS NULL
     )
     OR EXISTS (
       SELECT 1 FROM family_accounts
       WHERE lower(btrim(email)) = normalised_email
     ) THEN
    RAISE EXCEPTION 'This email is linked to a patient record';
  END IF;

  IF p_tos_version IS NULL OR btrim(p_tos_version) = '' THEN
    RAISE EXCEPTION 'Terms of Service acceptance is required';
  END IF;

  INSERT INTO clinics (
    name,
    subscription_tier,
    subscription_term,
    subscription_status,
    trial_ends_at,
    current_period_start,
    current_period_end,
    phone,
    email,
    address,
    city,
    state,
    postal_code,
    license_number,
    gst_number,
    hfr_id,
    tos_accepted_at,
    tos_version
  ) VALUES (
    p_clinic_name,
    'clinic',
    '1yr',
    'trialing',
    trial_end,
    trial_start,
    trial_end,
    p_clinic_phone,
    p_clinic_contact_email,
    p_clinic_address,
    p_clinic_city,
    p_clinic_state,
    p_clinic_postal_code,
    p_clinic_license_number,
    p_clinic_gst_number,
    p_clinic_hfr_id,
    now(),
    p_tos_version
  )
  RETURNING id INTO new_clinic_id;

  INSERT INTO profiles (clerk_user_id, email, full_name, role, clinic_id, is_clinic_admin)
  VALUES (calling_clerk_user_id, p_email, p_full_name, 'doctor', new_clinic_id, true)
  RETURNING * INTO new_profile;

  UPDATE clinics SET owner_profile_id = new_profile.id WHERE id = new_clinic_id;

  RETURN new_profile;
END;
$function$;

-- Only signed-in callers (and the server's service role) may execute the
-- current version. anon and PUBLIC are removed explicitly: Supabase grants
-- anon directly, so revoking PUBLIC alone would not be enough.
REVOKE EXECUTE ON FUNCTION public.create_clinic_and_become_admin(
  text, text, text, text, text, text, text, text, text, text, text, text, text
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_clinic_and_become_admin(
  text, text, text, text, text, text, text, text, text, text, text, text, text
) TO authenticated, service_role;

-- Legacy 3-argument overload (no ToS check, no new guards). The app has
-- never called it since the 13-argument version shipped. Not dropped
-- (migrations are additive); locked to the service role instead.
REVOKE EXECUTE ON FUNCTION public.create_clinic_and_become_admin(text, text, text)
  FROM PUBLIC, anon, authenticated;