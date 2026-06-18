-- ============================================================================
-- Chat 7: Appointments feature — additive schema fixes
-- ============================================================================

-- A. Add specialization to profiles (doctors need this on the booking form)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS specialization TEXT;

-- B. Add cancellation_reason to appointments
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

-- C. Move doctor_id FK from `users` → `profiles`
--    The Chat 2 schema pointed to `users`, which is empty in our system.
--    All auth lives in `profiles`. IF EXISTS makes this safe to re-run.
ALTER TABLE appointments
  DROP CONSTRAINT IF EXISTS appointments_doctor_id_fkey;

ALTER TABLE appointments
  ADD CONSTRAINT appointments_doctor_id_fkey
  FOREIGN KEY (doctor_id) REFERENCES profiles(id) ON DELETE RESTRICT;

-- D. Replace the five broken appointment RLS policies.
--    They all used `users.id = auth.uid()` which never matches a Clerk JWT.
--    Replacing with get_my_role() / get_my_clinic_id() — same pattern as patients.
DROP POLICY IF EXISTS "doctor_view_appointments"      ON appointments;
DROP POLICY IF EXISTS "staff_view_appointments"       ON appointments;
DROP POLICY IF EXISTS "patient_view_own_appointments" ON appointments;
DROP POLICY IF EXISTS "staff_insert_appointments"     ON appointments;
DROP POLICY IF EXISTS "staff_update_appointments"     ON appointments;

CREATE POLICY "appt_select_clinic_staff_doctor" ON appointments
  FOR SELECT TO authenticated
  USING (
    clinic_id = get_my_clinic_id()
    AND get_my_role() IN ('doctor', 'staff')
    AND deleted_at IS NULL
  );

CREATE POLICY "appt_insert_clinic_staff_doctor" ON appointments
  FOR INSERT TO authenticated
  WITH CHECK (
    clinic_id = get_my_clinic_id()
    AND get_my_role() IN ('doctor', 'staff')
  );

CREATE POLICY "appt_update_clinic_staff_doctor" ON appointments
  FOR UPDATE TO authenticated
  USING (
    clinic_id = get_my_clinic_id()
    AND get_my_role() IN ('doctor', 'staff')
    AND deleted_at IS NULL
  )
  WITH CHECK (
    clinic_id = get_my_clinic_id()
    AND get_my_role() IN ('doctor', 'staff')
  );