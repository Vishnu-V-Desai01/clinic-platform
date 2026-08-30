-- ============================================================================
-- Cleanup: remove the pre-existing, unscoped storage SELECT policy.
--
-- doctors_staff_read_clinic_documents (no "_can_" in the name, predates this
-- session) only checked bucket_id — no folder/clinic scoping at all. Any
-- doctor/staff at ANY clinic could read any other clinic's document via a
-- signed URL if they somehow had the exact file path. The correctly-scoped
-- doctors_staff_can_read_clinic_documents policy (fixed in
-- 20260826180000, using the right foldername() index) already covers
-- legitimate reads — this duplicate is now redundant and strictly weaker.
-- ============================================================================

DROP POLICY IF EXISTS "doctors_staff_read_clinic_documents" ON storage.objects;