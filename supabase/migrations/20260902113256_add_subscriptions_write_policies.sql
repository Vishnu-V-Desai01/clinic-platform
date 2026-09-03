BEGIN;

-- ─────────────────────────────────────────────────────────────
-- SUBSCRIPTIONS: INSERT POLICY
-- ─────────────────────────────────────────────────────────────

-- Clinic admins can create a subscription row for their own clinic.
-- This is what createCheckoutOrderAction relies on to insert the
-- 'pending' row before redirecting to Razorpay.
CREATE POLICY "subscriptions_admin_insert"
  ON public.subscriptions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    clinic_id = get_my_clinic_id()
    AND get_my_is_admin()
  );

-- ─────────────────────────────────────────────────────────────
-- SUBSCRIPTIONS: UPDATE POLICY
-- ─────────────────────────────────────────────────────────────

-- Clinic admins can update their own clinic's subscription rows.
-- Needed if we ever allow client-side status checks/cancellation;
-- the webhook itself uses the service role key and bypasses RLS
-- entirely, so this is not what makes the webhook work — it's a
-- separate, narrower allowance for the admin-facing UI.
CREATE POLICY "subscriptions_admin_update"
  ON public.subscriptions
  FOR UPDATE
  TO authenticated
  USING (
    clinic_id = get_my_clinic_id()
    AND get_my_is_admin()
  )
  WITH CHECK (
    clinic_id = get_my_clinic_id()
    AND get_my_is_admin()
  );

COMMIT;