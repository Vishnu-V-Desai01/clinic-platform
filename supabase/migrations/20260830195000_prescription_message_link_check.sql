-- Item 6 fix: message_queue_type_link_check didn't have a branch for
-- 'prescription' — a prescription message, like registration, has
-- neither appointment_id nor payment_id set (it's keyed to an encounter,
-- which message_queue has no column for at all). Same
-- DROP CONSTRAINT/ADD CONSTRAINT widening pattern already used twice for
-- this same constraint (medicine_receipt, then this).

ALTER TABLE public.message_queue
  DROP CONSTRAINT IF EXISTS message_queue_type_link_check;

ALTER TABLE public.message_queue
  ADD CONSTRAINT message_queue_type_link_check
  CHECK (
    (type = 'registration' AND appointment_id IS NULL AND payment_id IS NULL) OR
    (type = 'appointment' AND appointment_id IS NOT NULL AND payment_id IS NULL) OR
    (type = 'receipt' AND payment_id IS NOT NULL AND appointment_id IS NULL) OR
    (type = 'medicine_receipt' AND payment_id IS NOT NULL AND appointment_id IS NULL) OR
    (type = 'prescription' AND appointment_id IS NULL AND payment_id IS NULL)
  );