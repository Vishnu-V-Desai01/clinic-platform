CREATE OR REPLACE FUNCTION public.am_i_appointment_doctor_for_patient(p_patient_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM appointments a
    WHERE a.patient_id = p_patient_id
    AND a.doctor_id = get_my_profile_id()
    AND a.deleted_at IS NULL
  )
$function$;

CREATE OR REPLACE FUNCTION public.am_i_payment_doctor_for_patient(p_patient_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM payments p
    WHERE p.patient_id = p_patient_id
    AND p.doctor_id = get_my_profile_id()
  )
$function$;

DROP POLICY IF EXISTS patients_doctor_sees_assigned_only ON patients;

CREATE POLICY patients_doctor_sees_assigned_only
ON patients
AS RESTRICTIVE
FOR SELECT
USING (
  (get_my_role() <> 'doctor')
  OR get_my_is_admin()
  OR (assigned_doctor_id = get_my_profile_id())
  OR am_i_appointment_doctor_for_patient(patients.id)
  OR am_i_payment_doctor_for_patient(patients.id)
);