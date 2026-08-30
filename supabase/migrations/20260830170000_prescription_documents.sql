-- Item 6: prescription documents don't fit the payment-anchored shape
-- documents was built for — a prescription can exist for a visit that
-- never generates a charge. payment_id becomes nullable, a new
-- encounter_id column anchors prescription documents instead, and the
-- type constraint gains 'prescription' (same pattern as
-- 20260826130000_medicine_receipt_document_type.sql, which added
-- 'medicine_receipt' the same way).

ALTER TABLE documents
  ALTER COLUMN payment_id DROP NOT NULL;

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS encounter_id uuid REFERENCES encounters(id);

ALTER TABLE documents
  DROP CONSTRAINT IF EXISTS documents_document_type_check;

ALTER TABLE documents
  ADD CONSTRAINT documents_document_type_check
    CHECK (document_type IN ('receipt', 'treatment_details', 'medicine_receipt', 'prescription'));

-- A prescription document is anchored to an encounter, never a payment;
-- the other three types are anchored to a payment, never an encounter —
-- mutually exclusive, matching how each is actually generated.
ALTER TABLE documents
  ADD CONSTRAINT documents_anchor_check
    CHECK (
      (document_type = 'prescription' AND encounter_id IS NOT NULL AND payment_id IS NULL)
      OR (document_type IN ('receipt', 'treatment_details', 'medicine_receipt') AND payment_id IS NOT NULL AND encounter_id IS NULL)
    );

CREATE INDEX IF NOT EXISTS idx_documents_encounter_id ON documents(encounter_id);

COMMENT ON COLUMN documents.encounter_id IS
  'Anchor for prescription documents (document_type = ''prescription''). NULL for payment-anchored document types.';