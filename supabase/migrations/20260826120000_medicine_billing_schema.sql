-- ============================================================================
-- Chat C, Part 1 — medicine billing schema
--
-- Reuses the existing payments / payment_line_items / next_receipt_number()
-- infrastructure from Chat 10/13 rather than building a parallel billing
-- path. Three additions:
--
--   1. payments.payment_source — discriminator so medicine charges can be
--      told apart from consultation/manual charges for dashboard filtering
--      (objective 6) and PDF generation (medicine receipts need a
--      different layout than the consultation receipt).
--
--   2. payments.discounted_from_amount — nullable; set only when a
--      pharmacist/admin edits the autofilled bill down before dispensing
--      (objective 4's "editable to apply discounts"). Used to detect a
--      discount occurred and to notify the admin (objective 9).
--
--   3. payment_line_items.dispensation_id — nullable FK back to the
--      specific pharmacy_dispensations row a line item came from. Lets a
--      medicine receipt's line items be traced to exact dispensing events
--      (useful for the cancel/reversal path) without a second line-items
--      table.
--
-- No changes to next_receipt_number() — medicine receipts share the same
-- clinic-wide RCP-YYYY-NNNNNN sequence as consultation receipts. Every
-- number is unique per clinic regardless of source, which satisfies
-- objective 4's "unique medicine receipt id" without a second counter.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. payments.payment_source
-- ---------------------------------------------------------------------------

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS payment_source text NOT NULL DEFAULT 'consultation'
    CHECK (payment_source IN ('consultation', 'medicine', 'manual'));

COMMENT ON COLUMN public.payments.payment_source IS
  'Discriminates what generated this payment: consultation (post-visit charges step), medicine (pharmacy dispensing), or manual (a standalone charge with no appointment). Existing rows default to consultation via DEFAULT — correct for all pre-Chat-C data, since medicine billing did not exist before this.';

-- Backfill: every existing row predates medicine billing, so 'consultation'
-- is correct for appointment-linked rows. Manual (appointment_id IS NULL)
-- rows are reclassified to 'manual' explicitly, since DEFAULT alone can't
-- distinguish them after the fact.
UPDATE public.payments
SET payment_source = 'manual'
WHERE appointment_id IS NULL
  AND payment_source = 'consultation';

CREATE INDEX IF NOT EXISTS idx_payments_source
  ON public.payments(clinic_id, payment_source);

-- ---------------------------------------------------------------------------
-- 2. payments.discounted_from_amount — objective 9 (admin notified on discount)
-- ---------------------------------------------------------------------------

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS discounted_from_amount numeric(10, 2);

COMMENT ON COLUMN public.payments.discounted_from_amount IS
  'The catalogue-computed amount (qty x unit_price_paise, before any manual edit) — set only when the dispensing user edited the autofilled bill down. NULL means no discount was applied. amount_charged holds the final, possibly-discounted total; this column exists purely so the gap can be detected and surfaced to the admin.';

-- ---------------------------------------------------------------------------
-- 3. payment_line_items.dispensation_id
-- ---------------------------------------------------------------------------

ALTER TABLE public.payment_line_items
  ADD COLUMN IF NOT EXISTS dispensation_id uuid REFERENCES public.pharmacy_dispensations(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.payment_line_items.dispensation_id IS
  'Optional back-reference to the specific pharmacy_dispensations row this line item bills for. NULL for non-medicine line items (consultation charges, manual charges). Lets a medicine receipt''s line items be traced to exact dispensing events, e.g. for cancel/reversal.';

CREATE INDEX IF NOT EXISTS idx_payment_line_items_dispensation_id
  ON public.payment_line_items(dispensation_id)
  WHERE dispensation_id IS NOT NULL;

-- No RLS changes needed on either table — both already have clinic-scoped
-- policies from their original migrations (payments: doctor/staff via
-- get_my_clinic_id(); payment_line_items: "line_items_clinic_access" FOR ALL).
-- New nullable columns are automatically covered by those existing policies.