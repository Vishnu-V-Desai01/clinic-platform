DROP POLICY IF EXISTS patients_doctor_sees_assigned_only ON patients;

CREATE POLICY patients_doctor_sees_assigned_only
ON patients
AS RESTRICTIVE
FOR SELECT
USING (
  (get_my_role() <> 'doctor')
  OR get_my_is_admin()
  OR (assigned_doctor_id = get_my_profile_id())
);

DROP POLICY IF EXISTS patients_doctor_updates_assigned_only ON patients;

CREATE POLICY patients_doctor_updates_assigned_only
ON patients
AS RESTRICTIVE
FOR UPDATE
USING (
  (get_my_role() <> 'doctor')
  OR get_my_is_admin()
  OR (assigned_doctor_id = get_my_profile_id())
);