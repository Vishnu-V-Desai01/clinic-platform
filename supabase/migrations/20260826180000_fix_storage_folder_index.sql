-- ============================================================================
-- Fix storage.foldername() array index — off-by-one from the actual path
-- structure, confirmed by direct query:
--
--   storage.foldername('clinics/{clinic_id}/payments/{payment_id}/file.pdf')
--   = {"clinics", "{clinic_id}", "payments", "{payment_id}"}
--
-- Postgres arrays are 1-indexed, so [1] = "clinics" (the literal folder
-- name), and [2] = the actual clinic_id. Both prior migrations
-- (20260826150000, 20260826160000) used [1], which can never match any real
-- clinic — every upload was rejected regardless of the calling user's
-- actual clinic. This was proven wrong by directly querying
-- storage.foldername() against a real path, not just re-reasoned about.
-- ============================================================================

DROP POLICY IF EXISTS "doctors_staff_can_upload_clinic_documents" ON storage.objects;
CREATE POLICY "doctors_staff_can_upload_clinic_documents"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'clinic-documents'
    AND (storage.foldername(name))[2] = public.get_my_clinic_id()::text
    AND public.get_my_role() IN ('doctor', 'staff')
  );

DROP POLICY IF EXISTS "doctors_staff_can_read_clinic_documents" ON storage.objects;
CREATE POLICY "doctors_staff_can_read_clinic_documents"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'clinic-documents'
    AND (storage.foldername(name))[2] = public.get_my_clinic_id()::text
    AND public.get_my_role() IN ('doctor', 'staff')
  );