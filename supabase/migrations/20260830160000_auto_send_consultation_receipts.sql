-- ============================================================================
-- Automatic WhatsApp send for consultation/manual receipts, admin-toggleable
-- per clinic. Mirrors auto_send_medicine_receipts
-- (20260826170000_auto_send_medicine_receipts.sql) exactly.
--
-- Default TRUE: the receipt message sends automatically the moment
-- recordPaymentCollection processes the FIRST collection on a payment (the
-- existing isFirstCollection gate — see comment in recordPaymentCollection).
-- An admin can flip this off per clinic to fall back to the existing manual
-- flow: the receipt is still generated and queued in Messages exactly as
-- before, it just requires a staff member to click Send.
-- ============================================================================

ALTER TABLE public.clinics
  ADD COLUMN IF NOT EXISTS auto_send_consultation_receipts boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.clinics.auto_send_consultation_receipts IS
  'When true (default), the consultation/manual receipt WhatsApp message sends automatically right after the first payment collection on a charge. When false, the receipt is still generated and queued in Messages, but a staff member must send it manually.';