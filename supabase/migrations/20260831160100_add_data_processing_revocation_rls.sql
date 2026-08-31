-- DPDP compliance: when a patient revokes data_processing consent, clinic
-- staff should not be able to see them in patient lists or detail views.
-- This RESTRICTIVE policy hides patients where data_processing consent
-- exists and is explicitly revoked (is_active = false).
--
-- Only applies to doctor/staff roles. Patient role can still see themselves
-- even if they've revoked (via get_my_patient_id() scoping in the patient
-- portal's own queries), so they can manage their own consents.
--
-- Existing patients with NO consent rows at all (pre-backfill, if somehow
-- the backfill didn't run) will still be visible — this policy only filters
-- patients where consent exists and is explicitly false, not patients with
-- empty consent records.

create policy "patients_exclude_revoked_data_processing"
on patients for select
to authenticated
using (
  -- Clinic staff/doctor can only see patients who haven't revoked data_processing.
  -- Patient role has their own separate portal queries with different scoping,
  -- so this policy is irrelevant for them (they use get_my_family_account_id).
  (get_my_role() in ('doctor', 'staff') OR get_my_role() = 'patient')
  AND
  -- NOT (data_processing was explicitly revoked)
  NOT EXISTS (
    SELECT 1 FROM patient_consents pc
    WHERE pc.patient_id = patients.id
    AND pc.clinic_id = patients.clinic_id
    AND pc.purpose = 'data_processing'
    AND pc.is_active = false
  )
);

comment on policy "patients_exclude_revoked_data_processing" on patients is
  'DPDP: clinic staff cannot view patients who have revoked data_processing consent. Patients can revoke/re-grant anytime via patient portal.';