BEGIN;

-- Tracks paid add-on doctor seats, purchased either alongside a fresh
-- subscription checkout or mid-term. Each row is tied to the specific
-- subscription (term) it was bought for — add-ons do not automatically
-- carry forward when a subscription renews into a new term; the admin
-- re-purchases seats at renewal if still needed. This keeps proration and
-- "what am I paying for" unambiguous per term.
CREATE TABLE IF NOT EXISTS public.subscription_seat_addons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  razorpay_order_id text UNIQUE NOT NULL,
  razorpay_payment_id text,
  seats integer NOT NULL CHECK (seats > 0),
  amount_paise bigint NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_seat_addons_clinic_id ON public.subscription_seat_addons(clinic_id);
CREATE INDEX IF NOT EXISTS idx_seat_addons_subscription_id ON public.subscription_seat_addons(subscription_id);
CREATE INDEX IF NOT EXISTS idx_seat_addons_status ON public.subscription_seat_addons(status);

ALTER TABLE public.subscription_seat_addons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "seat_addons_admin_select"
  ON public.subscription_seat_addons
  FOR SELECT
  TO authenticated
  USING (clinic_id = get_my_clinic_id() AND get_my_is_admin());

CREATE POLICY "seat_addons_admin_insert"
  ON public.subscription_seat_addons
  FOR INSERT
  TO authenticated
  WITH CHECK (clinic_id = get_my_clinic_id() AND get_my_is_admin());

CREATE POLICY "seat_addons_admin_update"
  ON public.subscription_seat_addons
  FOR UPDATE
  TO authenticated
  USING (clinic_id = get_my_clinic_id() AND get_my_is_admin())
  WITH CHECK (clinic_id = get_my_clinic_id() AND get_my_is_admin());

-- Sum of seats from add-ons that are both themselves active AND whose
-- parent subscription term is still active. Once a term ends/renews, its
-- add-ons stop counting automatically — no separate expiry job needed.
CREATE OR REPLACE FUNCTION public.get_active_addon_seats(p_clinic_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
AS $function$
  SELECT COALESCE(SUM(sa.seats), 0)::integer
  FROM public.subscription_seat_addons sa
  JOIN public.subscriptions s ON s.id = sa.subscription_id
  WHERE sa.clinic_id = p_clinic_id
    AND sa.status = 'active'
    AND s.status = 'active';
$function$;

COMMIT;