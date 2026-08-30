-- ============================================================================
-- Fix clinic-documents storage policies — use the existing SECURITY DEFINER
-- helpers (get_my_clinic_id(), get_my_role()) instead of an inline subquery.
--
-- The previous migration (20260826150000) wrote the WITH CHECK/USING clause
-- as a raw `(SELECT clinic_id FROM profiles WHERE clerk_user_id = ...)`
-- subquery. Every other RLS policy in this codebase uses the established
-- SECURITY DEFINER helper functions instead, specifically because they are
-- proven to evaluate correctly under RLS — an inline subquery against
-- public.profiles from within a storage.objects policy is a different
-- evaluation context and was still failing the same upload after the first
-- migration confirmed-applied. This replaces both policies to match the
-- pattern used everywhere else (payments, pharmacy_drugs, etc.).
-- ============================================================================

DROP POLICY IF EXISTS "doctors_staff_can_upload_clinic_documents" ON storage.objects;
CREATE POLICY "doctors_staff_can_upload_clinic_documents"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'clinic-documents'
    AND (storage.foldername(name))[1] = public.get_my_clinic_id()::text
    AND public.get_my_role() IN ('doctor', 'staff')
  );

DROP POLICY IF EXISTS "doctors_staff_can_read_clinic_documents" ON storage.objects;
CREATE POLICY "doctors_staff_can_read_clinic_documents"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'clinic-documents'
    AND (storage.foldername(name))[1] = public.get_my_clinic_id()::text
    AND public.get_my_role() IN ('doctor', 'staff')
  );

-- Leaves the pre-existing "doctors_staff_read_clinic_documents" (no "_can_")
-- policy untouched — it was already there before this session's changes and
-- is out of scope for this fix.