BEGIN;

-- ─────────────────────────────────────────────────────────────
-- ADD COLUMNS TO CLINICS TABLE
-- ─────────────────────────────────────────────────────────────

-- ToS acceptance tracking
ALTER TABLE public.clinics
  ADD COLUMN IF NOT EXISTS tos_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS tos_version text;

-- ─────────────────────────────────────────────────────────────
-- CREATE SUBSCRIPTIONS TABLE
-- ─────────────────────────────────────────────────────────────

-- Tracks paid subscriptions. Each row = one payment term (1yr, 3yr, or 5yr).
-- Separate from clinics.subscription_* columns because subscriptions table
-- is audit-only (immutable after creation); clinics table is the source of
-- truth for current status.
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  razorpay_order_id text UNIQUE NOT NULL,
  razorpay_payment_id text,
  tier text NOT NULL CHECK (tier IN ('solo', 'clinic', 'group')),
  term text NOT NULL CHECK (term IN ('1yr', '3yr', '5yr')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'past_due', 'expired')),
  amount_paise integer NOT NULL,
  current_period_start timestamptz,
  current_period_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_clinic_id ON public.subscriptions(clinic_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions(status);

-- ─────────────────────────────────────────────────────────────
-- CREATE INVOICES TABLE
-- ─────────────────────────────────────────────────────────────

-- Audit trail of all invoices issued to clinics.
-- Invoice number is generated via sequence (not UUID) for human readability.
CREATE TABLE IF NOT EXISTS public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  invoice_number text UNIQUE NOT NULL,
  amount_paise integer NOT NULL,
  currency text NOT NULL DEFAULT 'INR',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'issued', 'paid', 'refunded', 'cancelled')),
  issued_at timestamptz NOT NULL DEFAULT now(),
  due_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoices_clinic_id ON public.invoices(clinic_id);
CREATE INDEX IF NOT EXISTS idx_invoices_subscription_id ON public.invoices(subscription_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices(status);

-- ─────────────────────────────────────────────────────────────
-- CREATE ENTERPRISE_LEADS TABLE
-- ─────────────────────────────────────────────────────────────

-- CRM table for enterprise tier inquiries.
-- Anonymous insertion allowed so clinics can submit without a session.
CREATE TABLE IF NOT EXISTS public.enterprise_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_name text NOT NULL,
  contact_name text,
  contact_email text,
  contact_phone text,
  doctor_count integer,
  message text,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'qualified', 'won', 'lost')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_enterprise_leads_status ON public.enterprise_leads(status);

-- ─────────────────────────────────────────────────────────────
-- CREATE HELPER FUNCTIONS
-- ─────────────────────────────────────────────────────────────

-- Generates the next invoice number (CRK/YYMM/00001 format).
-- Uses a shared sequence to ensure uniqueness across all clinics.
CREATE SEQUENCE IF NOT EXISTS public.invoice_number_seq START 1 INCREMENT 1;

CREATE OR REPLACE FUNCTION public.next_invoice_number()
RETURNS text
LANGUAGE sql
STABLE
AS $function$
  SELECT 'CRK/' || to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYMM') || '/' ||
         LPAD(nextval('invoice_number_seq')::text, 5, '0');
$function$;

-- Returns the doctor seat limit for a given tier.
CREATE OR REPLACE FUNCTION public.get_tier_doctor_limit(p_tier text)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
AS $function$
BEGIN
  CASE p_tier
    WHEN 'solo' THEN RETURN 1;
    WHEN 'clinic' THEN RETURN 4;
    WHEN 'group' THEN RETURN 10;
    ELSE RETURN 0;
  END CASE;
END;
$function$;

-- Counts active doctors (not removed) in a clinic.
CREATE OR REPLACE FUNCTION public.count_clinic_doctors(p_clinic_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
AS $function$
  SELECT COUNT(*)::integer
  FROM public.profiles
  WHERE clinic_id = p_clinic_id
    AND role = 'doctor'
    AND status IN ('active', 'suspended');
$function$;

-- ─────────────────────────────────────────────────────────────
-- UPDATE CREATE_CLINIC_AND_BECOME_ADMIN FUNCTION
-- ─────────────────────────────────────────────────────────────

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
-- This is a defense-in-depth check — the actual "must check the box"
-- enforcement lives in the Zod schema and the UI — so that a future bug
-- in either of those layers can't silently create a clinic with no
-- recorded ToS acceptance.
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
    'clinic',       -- DEFAULT_TRIAL_TIER in pricing.ts
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