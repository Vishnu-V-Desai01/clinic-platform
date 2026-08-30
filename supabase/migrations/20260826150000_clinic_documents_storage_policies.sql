-- ============================================================================
-- clinic-documents storage bucket — RLS policies for storage.objects
--
-- The original bucket migration (20260620073834_create_documents_table.sql)
-- documented these policies only as a comment, never actually applied them.
-- That meant NO ONE could upload to this bucket under RLS — the consultation
-- receipt/treatment_details pipeline likely worked only because of a
-- service-role key bypassing RLS somewhere, or has been silently failing
-- the same way medicine receipts just did. This migration makes the policy
-- real, for INSERT (upload) and SELECT (download/signed URLs), scoped to
-- doctor/staff of the object's own clinic — mirroring the exact pattern
-- already used everywhere else in this codebase (get_my_clinic_id(),
-- get_my_role()).
--
-- Storage path convention (from document-storage.ts / payments/document-
-- storage.ts): clinics/{clinic_id}/payments/{payment_id}/{file_name}.pdf
-- The clinic_id is folder segment 1 — storage.foldername(name) returns an
-- array of path segments, so [1] (1-indexed) is that first folder.
-- ============================================================================

-- Upload (INSERT) — doctor/staff of the clinic matching the object's own
-- path prefix.
DROP POLICY IF EXISTS "doctors_staff_can_upload_clinic_documents" ON storage.objects;
CREATE POLICY "doctors_staff_can_upload_clinic_documents"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'clinic-documents'
    AND (storage.foldername(name))[1] = (
      SELECT clinic_id::text FROM public.profiles WHERE clerk_user_id = auth.jwt()->>'sub'
    )
    AND (
      SELECT role FROM public.profiles WHERE clerk_user_id = auth.jwt()->>'sub'
    ) IN ('doctor', 'staff')
  );

-- Download (SELECT) — same rule. This is the policy the original migration's
-- comment described but never created as a real CREATE POLICY statement.
DROP POLICY IF EXISTS "doctors_staff_can_read_clinic_documents" ON storage.objects;
CREATE POLICY "doctors_staff_can_read_clinic_documents"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'clinic-documents'
    AND (storage.foldername(name))[1] = (
      SELECT clinic_id::text FROM public.profiles WHERE clerk_user_id = auth.jwt()->>'sub'
    )
    AND (
      SELECT role FROM public.profiles WHERE clerk_user_id = auth.jwt()->>'sub'
    ) IN ('doctor', 'staff')
  );