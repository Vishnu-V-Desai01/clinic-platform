-- ============================================================================
-- Chat 10: Payments feature — create documents table + Supabase Storage setup
-- ============================================================================

-- A. Create the documents table
-- Immutable records of generated PDFs (receipts, treatment details).
-- Linked to payments; no UPDATE/DELETE policies.
CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  payment_id uuid NOT NULL REFERENCES payments(id),
  patient_id uuid NOT NULL REFERENCES patients(id),
  
  -- Document metadata
  document_type text NOT NULL CHECK (document_type IN ('receipt', 'treatment_details')),
  file_name text NOT NULL,
  file_path text NOT NULL, -- Supabase Storage path
  file_size_bytes integer,
  mime_type text NOT NULL DEFAULT 'application/pdf',
  
  -- Document state (immutable; no editing after creation)
  is_final boolean NOT NULL DEFAULT true, -- Always true; documents are write-once
  
  -- Audit (immutable)
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES profiles(id),
  
  -- Constraints
  CONSTRAINT unique_document_per_payment_type UNIQUE (payment_id, document_type)
);

-- B. Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_documents_clinic_payment 
  ON documents(clinic_id, payment_id);

CREATE INDEX IF NOT EXISTS idx_documents_patient_id 
  ON documents(patient_id);

CREATE INDEX IF NOT EXISTS idx_documents_document_type 
  ON documents(clinic_id, document_type);

CREATE INDEX IF NOT EXISTS idx_documents_created_at 
  ON documents(clinic_id, created_at DESC);

-- C. Enable RLS on documents table
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- D. RLS Policies: doctors and staff can read documents for their clinic
--    No INSERT/UPDATE/DELETE allowed after initial creation (see trigger below)
DROP POLICY IF EXISTS "documents_select_clinic_staff_doctor" ON documents;
CREATE POLICY "documents_select_clinic_staff_doctor" ON documents
  FOR SELECT TO authenticated
  USING (
    clinic_id = get_my_clinic_id()
    AND get_my_role() IN ('doctor', 'staff')
  );

DROP POLICY IF EXISTS "documents_insert_clinic_staff_doctor" ON documents;
CREATE POLICY "documents_insert_clinic_staff_doctor" ON documents
  FOR INSERT TO authenticated
  WITH CHECK (
    clinic_id = get_my_clinic_id()
    AND get_my_role() IN ('doctor', 'staff')
  );

-- NO UPDATE POLICY: documents are immutable
-- NO DELETE POLICY: documents are permanent audit trail

-- E. Trigger: prevent updates (enforce immutability)
CREATE OR REPLACE FUNCTION trigger_prevent_document_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Documents are immutable and cannot be updated';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_document_update ON documents;
CREATE TRIGGER trg_prevent_document_update
  BEFORE UPDATE ON documents
  FOR EACH ROW
  EXECUTE FUNCTION trigger_prevent_document_update();

-- F. Trigger: prevent deletion (enforce permanent retention)
CREATE OR REPLACE FUNCTION trigger_prevent_document_deletion()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Documents are permanent audit records and cannot be deleted';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_document_deletion ON documents;
CREATE TRIGGER trg_prevent_document_deletion
  BEFORE DELETE ON documents
  FOR EACH ROW
  EXECUTE FUNCTION trigger_prevent_document_deletion();

-- G. Storage bucket for documents (private per clinic)
-- NOTE: This is configured via supabase/config.json or the dashboard.
-- The bucket should be created with:
--   Name: clinic-documents
--   Public: false
--   Allowed MIME types: application/pdf
-- 
-- RLS policy for storage (added via SQL or dashboard):
-- CREATE POLICY "doctors_staff_can_read_clinic_documents"
-- ON storage.objects
-- FOR SELECT TO authenticated
-- USING (
--   bucket_id = 'clinic-documents'
--   AND (storage.foldername(name))[1] = (SELECT clinic_id::text FROM profiles WHERE clerk_user_id = auth.jwt()->>'sub')
-- );
--
-- Storage path convention: clinics/{clinic_id}/payments/{payment_id}/receipt.pdf
--                         clinics/{clinic_id}/payments/{payment_id}/treatment_details.pdf