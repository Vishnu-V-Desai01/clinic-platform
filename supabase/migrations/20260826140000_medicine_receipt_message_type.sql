-- ============================================================================
-- Chat C, Part 2 — extend messaging system for medicine receipts
--
-- Medicine payments (payment_source = 'medicine') need a distinct
-- message_queue type from consultation receipts, because createReceiptMessage
-- hard-requires BOTH a 'receipt' and a 'treatment_details' document — a
-- medicine payment will only ever have a 'medicine_receipt' document, never
-- treatment_details. Reusing 'receipt' as-is would make every medicine
-- payment message permanently fail to queue.
--
-- The existing 'receipt' type's link-check shape (payment_id NOT NULL,
-- appointment_id NULL) already matches what a medicine payment needs —
-- medicine payments are never appointment-linked (Part 1) — so
-- 'medicine_receipt' reuses that same shape rather than inventing a new one.
--
-- Only an English seed template is added here. The other four languages
-- (hi/ta/gu/kn) are deferred until the actual WhatsApp copy is drafted and
-- reviewed together, per the project's stated plan — placeholder translated
-- text for a financial document is worse than temporarily English-only.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. message_templates.type
-- ---------------------------------------------------------------------------

ALTER TABLE public.message_templates
  DROP CONSTRAINT IF EXISTS message_templates_type_check;

ALTER TABLE public.message_templates
  ADD CONSTRAINT message_templates_type_check
  CHECK (type IN ('registration', 'appointment', 'receipt', 'medicine_receipt'));

-- ---------------------------------------------------------------------------
-- 2. message_queue.type + its compound link-check
-- ---------------------------------------------------------------------------

ALTER TABLE public.message_queue
  DROP CONSTRAINT IF EXISTS message_queue_type_check;

ALTER TABLE public.message_queue
  ADD CONSTRAINT message_queue_type_check
  CHECK (type IN ('registration', 'appointment', 'receipt', 'medicine_receipt'));

ALTER TABLE public.message_queue
  DROP CONSTRAINT IF EXISTS message_queue_type_link_check;

ALTER TABLE public.message_queue
  ADD CONSTRAINT message_queue_type_link_check
  CHECK (
    (type = 'registration' AND appointment_id IS NULL AND payment_id IS NULL) OR
    (type = 'appointment' AND appointment_id IS NOT NULL AND payment_id IS NULL) OR
    (type = 'receipt' AND payment_id IS NOT NULL AND appointment_id IS NULL) OR
    (type = 'medicine_receipt' AND payment_id IS NOT NULL AND appointment_id IS NULL)
  );

-- ---------------------------------------------------------------------------
-- 3. Seed template — English only, placeholder set: PATIENT_NAME,
--    CLINIC_NAME, RECEIPT_LINK (no TREATMENT_PDF_LINK — medicine receipts
--    have no treatment_details counterpart).
-- ---------------------------------------------------------------------------

INSERT INTO public.message_templates (type, language, content) VALUES
('medicine_receipt', 'en', 'Hi {PATIENT_NAME}, thank you for visiting {CLINIC_NAME}. Your medicine receipt is ready. Receipt: {RECEIPT_LINK}. Link is active for 7 days.')
ON CONFLICT (type, language) DO NOTHING;