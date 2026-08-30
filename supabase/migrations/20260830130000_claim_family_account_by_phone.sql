-- supabase/migrations/20260830130000_claim_family_account_by_phone.sql
--
-- Item 3a: lets a patient who was registered WITHOUT an email claim a
-- family account by phone number instead. Companion to claim_family_account
-- (email-based), which only works when family_accounts already has a row
-- for that email — a patient with no email has no such row to claim.
--
-- Exclusion rule (per product decision): a patient card is only eligible
-- if it has NO email on file (email IS NULL). A card that already has its
-- own email is excluded — it's already claimable through its own email
-- flow, and pulling it into a DIFFERENT person's family via a shared
-- phone number would let that other person view it. This is a data
-- exposure boundary, not just deduplication.
--
-- On successful claim, matched patient rows get BOTH family_account_id
-- AND email stamped. Setting email is what makes the claim permanent:
-- once set, the row's email is no longer NULL, so it can never again
-- match a later phone-based claim attempt by someone else on the same
-- shared number.

CREATE OR REPLACE FUNCTION public.claim_family_account_by_phone(
  p_phone text,
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
  matched_count int;
BEGIN
  IF calling_clerk_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Lock every unclaimed, email-less card on this phone number up front,
  -- so two simultaneous claim attempts on the same shared number can't
  -- both succeed and split the household across two family accounts.
  PERFORM 1 FROM patients
    WHERE phone = p_phone AND email IS NULL AND deleted_at IS NULL
    FOR UPDATE;

  SELECT count(*) INTO matched_count FROM patients
    WHERE phone = p_phone AND email IS NULL AND deleted_at IS NULL;

  IF matched_count = 0 THEN
    RAISE EXCEPTION 'No patient record found for this phone number';
  END IF;

  -- Get-or-create the family account for the Clerk email the caller
  -- actually signed in with — same get-or-create shape as the
  -- link_patient_to_family_account trigger uses on patient insert.
  INSERT INTO family_accounts (email) VALUES (p_email)
    ON CONFLICT (email) DO NOTHING;

  SELECT * INTO fam FROM family_accounts WHERE email = p_email FOR UPDATE;

  IF fam.clerk_user_id IS NOT NULL AND fam.clerk_user_id <> calling_clerk_user_id THEN
    RAISE EXCEPTION 'This account is already claimed';
  END IF;

  IF fam.clerk_user_id IS NULL THEN
    UPDATE family_accounts SET clerk_user_id = calling_clerk_user_id WHERE id = fam.id
      RETURNING * INTO fam;
  END IF;

  UPDATE patients
    SET family_account_id = fam.id, email = p_email
    WHERE phone = p_phone AND email IS NULL AND deleted_at IS NULL;

  RETURN fam;
END;
$function$;

COMMENT ON FUNCTION public.claim_family_account_by_phone IS
  'Phone-based counterpart to claim_family_account. Matches patient cards by phone where email IS NULL only — cards with their own email are excluded to prevent cross-family data exposure via a shared phone number. Stamps email onto matched rows so the claim cannot be repeated by a different signer later.';