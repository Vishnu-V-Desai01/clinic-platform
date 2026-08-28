DROP POLICY IF EXISTS payments_select_clinic_staff_doctor ON payments;

CREATE POLICY payments_select_clinic_staff_doctor
ON payments
FOR SELECT
USING (
  clinic_id = get_my_clinic_id()
  AND (
    get_my_role() = 'staff'
    OR get_my_is_admin()
    OR (
      get_my_role() = 'doctor'
      AND patient_id IN (
        SELECT id FROM patients
        WHERE assigned_doctor_id = get_my_profile_id()
        AND deleted_at IS NULL
      )
    )
  )
);