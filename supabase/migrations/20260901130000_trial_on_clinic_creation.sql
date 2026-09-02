BEGIN;

-- Sets trial dates explicitly on clinic creation, rather than relying
-- solely on column defaults. subscription_tier/term/status already default
-- correctly via the Step 2 migration (clinic / 1yr / trialing), but
-- trial_ends_at, current_period_start, and current_period_end have no
-- column default — an unmodified INSERT would leave them NULL, producing
-- a clinic that is 'trialing' but never expires. TRIAL_DAYS = 14, matching
-- src/features/billing/pricing.ts — if that constant ever changes, this
-- function must be updated to match.
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
  trial_start timestamptz := now();
  trial_end timestamptz := now() + interval '14 days';
BEGIN
  IF calling_clerk_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF EXISTS (SELECT 1 FROM profiles WHERE clerk_user_id = calling_clerk_user_id) THEN
    RAISE EXCEPTION 'Profile already exists for this user';
  END IF;

  INSERT INTO clinics (
    name,
    subscription_tier,
    subscription_term,
    subscription_status,
    trial_ends_at,
    current_period_start,
    current_period_end
  ) VALUES (
    p_clinic_name,
    'clinic',       -- DEFAULT_TRIAL_TIER in pricing.ts
    '1yr',
    'trialing',
    trial_end,
    trial_start,
    trial_end
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