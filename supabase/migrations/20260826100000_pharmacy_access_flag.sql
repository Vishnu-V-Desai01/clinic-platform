-- ============================================================================
-- Pharmacy access as an admin-granted permission (Chat A, Step 1)
--
-- Replaces the old access model (staff_type='pharmacist' OR is_clinic_admin)
-- with an explicit, admin-toggled flag that can be granted to ANY clinical
-- user — doctor or staff alike. A doctor cannot have a staff_type, which is
-- why the old model could not express "this specific doctor runs the
-- pharmacy."
--
-- staff_type='pharmacist' is intentionally NOT dropped (additive-only
-- migration policy) but is no longer consulted for access decisions.
--
-- IMPLEMENTATION NOTE: am_i_pharmacist() is redefined in place rather than
-- replaced. Every pharmacy RLS policy (20260822180400) and both dispensing
-- RPCs (20260822180300) call it by name, so redefining its body updates all
-- of them atomically with no policy rewrites. am_i_pharmacy_user() is the
-- name new code should use; am_i_pharmacist() remains as a compatibility
-- shim so existing definitions keep working.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. The flag itself
-- ---------------------------------------------------------------------------

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS pharmacy_access boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.pharmacy_access IS
  'Admin-granted permission to manage pharmacy inventory and dispense medicine. Independent of role: grantable to doctors and staff alike. is_clinic_admin implies this — see am_i_pharmacy_user().';

-- Backfill: anyone who had access under the OLD model keeps it, so this
-- migration never silently revokes access from an existing user.
UPDATE public.profiles
SET pharmacy_access = true
WHERE staff_type = 'pharmacist'
  AND pharmacy_access = false;

-- ---------------------------------------------------------------------------
-- 2. New canonical helper
--
-- is_clinic_admin implies pharmacy access (per product decision) — an admin
-- never has to grant themselves permission to run their own clinic's
-- pharmacy.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.am_i_pharmacy_user()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT p.pharmacy_access OR p.is_clinic_admin
      FROM public.profiles p
      WHERE p.clerk_user_id = auth.jwt() ->> 'sub'
      LIMIT 1
    ),
    false
  );
$$;

COMMENT ON FUNCTION public.am_i_pharmacy_user() IS
  'True when the current user may manage pharmacy inventory and dispense. Canonical helper — new policies and RPCs should reference this, not am_i_pharmacist().';

-- ---------------------------------------------------------------------------
-- 3. Compatibility shim
--
-- Redefined body, same name and signature. Existing pharmacy_drugs /
-- pharmacy_inventory / pharmacy_stock_adjustments / pharmacy_dispensations
-- policies and the pharmacy_dispense() / pharmacy_cancel_dispensation() RPCs
-- all reference this and now resolve to the new access model automatically.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.am_i_pharmacist()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT public.am_i_pharmacy_user();
$$;

COMMENT ON FUNCTION public.am_i_pharmacist() IS
  'DEPRECATED NAME, LIVE BEHAVIOUR. Delegates to am_i_pharmacy_user(). Retained because existing pharmacy RLS policies and dispensing RPCs reference it by name. Do not use in new code.';

-- ---------------------------------------------------------------------------
-- 4. Admins may grant/revoke pharmacy access within their own clinic
--
-- Named distinctly so it cannot collide with the existing admin user-
-- management policies from the Chat 21 admin layer. If an equivalent policy
-- already covers profile updates by admins, this is harmless overlap —
-- Postgres ORs permissive policies together.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS profiles_admin_manage_pharmacy_access ON public.profiles;

CREATE POLICY profiles_admin_manage_pharmacy_access
  ON public.profiles
  FOR UPDATE
  USING (
    public.am_i_clinic_admin()
    AND clinic_id = public.get_my_clinic_id()
  )
  WITH CHECK (
    public.am_i_clinic_admin()
    AND clinic_id = public.get_my_clinic_id()
  );