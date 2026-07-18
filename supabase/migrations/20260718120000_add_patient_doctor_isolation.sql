BEGIN;

-- Doctors see only patients assigned to them.
-- Staff are unaffected: get_my_role() <> 'doctor' evaluates true
-- for staff, so the OR short-circuits and they see everything.
-- Additive: existing staff_select_patients policy stays untouched.
CREATE POLICY patients_doctor_sees_assigned_only
ON patients
AS RESTRICTIVE
FOR SELECT
USING (
  get_my_role() <> 'doctor'
  OR assigned_doctor_id = (
    SELECT id FROM profiles WHERE clerk_user_id = (auth.jwt()->>'sub')
  )
);

-- Doctors can only update their own patients.
CREATE POLICY patients_doctor_updates_assigned_only
ON patients
AS RESTRICTIVE
FOR UPDATE
USING (
  get_my_role() <> 'doctor'
  OR assigned_doctor_id = (
    SELECT id FROM profiles WHERE clerk_user_id = (auth.jwt()->>'sub')
  )
)
WITH CHECK (
  get_my_role() <> 'doctor'
  OR assigned_doctor_id = (
    SELECT id FROM profiles WHERE clerk_user_id = (auth.jwt()->>'sub')
  )
);

-- When a doctor registers a new patient and doesn't explicitly set
-- assigned_doctor_id, auto-assign to themselves. Staff registering
-- patients are unaffected (their role is 'staff' not 'doctor').
-- This means going forward every patient a doctor registers is
-- immediately visible to them under the new RESTRICTIVE policy.
CREATE OR REPLACE FUNCTION auto_assign_doctor_on_patient_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  inserting_role text := get_my_role();
  inserting_profile_id uuid;
BEGIN
  IF inserting_role = 'doctor' AND NEW.assigned_doctor_id IS NULL THEN
    SELECT id INTO inserting_profile_id
    FROM profiles
    WHERE clerk_user_id = (auth.jwt()->>'sub');
    NEW.assigned_doctor_id := inserting_profile_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_assign_doctor_on_patient_insert
BEFORE INSERT ON patients
FOR EACH ROW
EXECUTE FUNCTION auto_assign_doctor_on_patient_insert();

COMMIT;