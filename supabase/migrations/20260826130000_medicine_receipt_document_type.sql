-- ============================================================================
-- Chat C, Part 2 — extend documents.document_type for medicine receipts
--
-- Medicine payments (payment_source = 'medicine', from Part 1) need their
-- own receipt document — a per-drug line-item layout, distinct from the
-- consultation receipt/treatment_details pair. This just widens the existing
-- CHECK constraint; no other structural change to `documents` is needed —
-- the UNIQUE(payment_id, document_type) constraint and the immutability
-- triggers both already do the right thing for this new type without
-- modification (each medicine payment is its own row, so one
-- 'medicine_receipt' document per medicine payment is exactly what the
-- unique constraint already enforces).
-- ============================================================================

ALTER TABLE public.documents
  DROP CONSTRAINT IF EXISTS documents_document_type_check;

ALTER TABLE public.documents
  ADD CONSTRAINT documents_document_type_check
  CHECK (document_type IN ('receipt', 'treatment_details', 'medicine_receipt'));