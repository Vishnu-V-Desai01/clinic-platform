BEGIN;

-- Patients can view their own clinical record(s) across every
-- clinic linked to their identity — this is what powers the
-- "switch clinic" dropdown on their own dashboard.
CREATE POLICY patients_self_view_own_records
ON patients
FOR SELECT
USING (
  patient_identity_id = get_my_patient_identity_id()
  AND deleted_at IS NULL
);

-- A doctor with an approved, unexpired access grant can view a
-- patient's record at a clinic they don't otherwise belong to.
-- Full-row visibility for now — finer-grained "granted_scopes"
-- enforcement extends into individual clinical tables later,
-- not here.
CREATE POLICY patients_cross_clinic_approved_access
ON patients
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM patient_access_grants pag
    WHERE pag.patient_identity_id = patients.patient_identity_id
      AND pag.target_clinic_id = patients.clinic_id
      AND pag.requesting_doctor_id = (
        SELECT id FROM profiles WHERE clerk_user_id = (auth.jwt()->>'sub')
      )
      AND pag.status = 'approved'
      AND pag.expires_at > now()
  )
);

COMMIT;