-- Item 6 fix: message_templates and message_queue both have their own
-- 'type' CHECK constraints, separate from the app-side MESSAGE_TYPES
-- enum in messaging/schema.ts — the two are NOT automatically kept in
-- sync, as the earlier medicine_receipt migration
-- (20260826140000_medicine_receipt_message_type.sql) already had to widen
-- both explicitly. This migration does the same for 'prescription'.

ALTER TABLE public.message_templates
  DROP CONSTRAINT IF EXISTS message_templates_type_check;

ALTER TABLE public.message_templates
  ADD CONSTRAINT message_templates_type_check
  CHECK (type IN ('registration', 'appointment', 'receipt', 'medicine_receipt', 'prescription'));

ALTER TABLE public.message_queue
  DROP CONSTRAINT IF EXISTS message_queue_type_check;

ALTER TABLE public.message_queue
  ADD CONSTRAINT message_queue_type_check
  CHECK (type IN ('registration', 'appointment', 'receipt', 'medicine_receipt', 'prescription'));