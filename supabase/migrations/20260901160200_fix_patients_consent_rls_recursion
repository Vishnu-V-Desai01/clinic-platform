-- The direct EXISTS subquery against patient_consents inside
-- patients_exclude_revoked_data_processing caused infinite recursion:
-- evaluating a patients row required evaluating patient_consents RLS,
-- whose own SELECT policy (patient_consents_select_patient_own) queries
-- patients to resolve family_account_id, which re-triggers the patients
-- policy being evaluated in the first place.
--
-- Fix: move the patient_consents lookup into a SECURITY DEFINER function.
-- SECURITY DEFINER functions run with the privileges of their owner and
-- bypass RLS on the tables they query internally, breaking the cycle —
-- same pattern already used elsewhere in this schema (get_my_clinic_id,
-- am_i_appointment_doctor_for_patient, etc.) for exactly this class of
-- problem.

CREATE OR REPLACE FUNCTION public.has_revoked_data_processing(p_patient_id uuid, p_clinic_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM patient_consents pc
    WHERE pc.patient_id = p_patient_id
      AND pc.clinic_id = p_clinic_id
      AND pc.purpose = 'data_processing'
      AND pc.is_active = false
  );
$$;

GRANT EXECUTE ON FUNCTION public.has_revoked_data_processing(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS "patients_exclude_revoked_data_processing" ON patients;

CREATE POLICY "patients_exclude_revoked_data_processing"
ON patients FOR SELECT
TO authenticated
USING (
  (get_my_role() IN ('doctor', 'staff') OR get_my_role() = 'patient')
  AND NOT has_revoked_data_processing(id, clinic_id)
);

COMMENT ON POLICY "patients_exclude_revoked_data_processing" ON patients IS
  'DPDP: clinic staff cannot view patients who have revoked data_processing consent. Uses SECURITY DEFINER function has_revoked_data_processing to avoid RLS recursion with patient_consents policies.';