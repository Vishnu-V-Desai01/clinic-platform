-- ============================================================================
-- Automatic WhatsApp send for medicine receipts, admin-toggleable per clinic.
--
-- Default TRUE: the medicine receipt message sends automatically the moment
-- dispenseAndBillEncounter completes — no staff action required. An admin
-- can flip this off per clinic to fall back to the existing manual flow:
-- the receipt is still generated and queued in Messages exactly as before,
-- it just requires a staff member to click Send.
-- ============================================================================

ALTER TABLE public.clinics
  ADD COLUMN IF NOT EXISTS auto_send_medicine_receipts boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.clinics.auto_send_medicine_receipts IS
  'When true (default), the medicine receipt WhatsApp message sends automatically right after a medicine payment completes. When false, the receipt is still generated and queued in Messages, but a staff member must send it manually.';