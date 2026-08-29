DROP POLICY IF EXISTS message_queue_doctor_scoped_select ON message_queue;

CREATE POLICY message_queue_doctor_scoped_select
ON message_queue
AS RESTRICTIVE
FOR SELECT
USING (
  (get_my_role() <> 'doctor')
  OR get_my_is_admin()
  OR (patient_id IN (
    SELECT id FROM patients
    WHERE assigned_doctor_id = get_my_profile_id()
    AND deleted_at IS NULL
  ))
);

DROP POLICY IF EXISTS message_queue_doctor_scoped_update ON message_queue;

CREATE POLICY message_queue_doctor_scoped_update
ON message_queue
AS RESTRICTIVE
FOR UPDATE
USING (
  (get_my_role() <> 'doctor')
  OR get_my_is_admin()
  OR (patient_id IN (
    SELECT id FROM patients
    WHERE assigned_doctor_id = get_my_profile_id()
    AND deleted_at IS NULL
  ))
);