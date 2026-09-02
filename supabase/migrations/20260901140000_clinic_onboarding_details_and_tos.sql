BEGIN;

-- Records that the admin creating a clinic accepted the Terms of Service /
-- Privacy Policy, and which version they accepted. tos_version is separate
-- from tos_accepted_at so that if terms are ever revised, it's possible to
-- tell which clinics accepted an older version (relevant if re-consent is
-- ever required after a material change).
ALTER TABLE public.clinics
  ADD COLUMN IF NOT EXISTS tos_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS tos_version text;

-- Extends create_clinic_and_become_admin (originally added in
-- 20260716140000_add_onboarding_functions.sql, trial dates added in
-- 20260901130000_trial_on_clinic_creation.sql) to also capture clinic
-- contact/registration details and enforce ToS acceptance at creation time.
--
-- All clinic detail parameters are optional (nullable), matching the
-- optionality of the same fields in clinic-settings-form.tsx — a clinic
-- can fill these in later via Settings. p_tos_version has no default and
-- is checked for a real value: a NULL or empty string means the caller
-- (the server action) didn't confirm acceptance, and creation is refused.
-- This is defense-in-depth — the actual "must check the box" enforcement
-- lives in the Zod schema and the UI — so a future bug in either of those
-- layers can't silently create a clinic with no recorded ToS acceptance.
CREATE OR REPLACE FUNCTION public.create_clinic_and_become_admin(
  p_clinic_name text,
  p_email text,
  p_full_name text,
  p_clinic_phone text DEFAULT NULL,
  p_clinic_contact_email text DEFAULT NULL,
  p_clinic_address text DEFAULT NULL,
  p_clinic_city text DEFAULT NULL,
  p_clinic_state text DEFAULT NULL,
  p_clinic_postal_code text DEFAULT NULL,
  p_clinic_license_number text DEFAULT NULL,
  p_clinic_gst_number text DEFAULT NULL,
  p_clinic_hfr_id text DEFAULT NULL,
  p_tos_version text DEFAULT NULL
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
  trial_start timestamptz := now();
  trial_end timestamptz := now() + interval '14 days';
BEGIN
  IF calling_clerk_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF EXISTS (SELECT 1 FROM profiles WHERE clerk_user_id = calling_clerk_user_id) THEN
    RAISE EXCEPTION 'Profile already exists for this user';
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

COMMIT;