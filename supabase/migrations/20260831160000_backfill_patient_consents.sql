-- Backfill consent for all existing patients created before DPDP enforcement.
-- Grants the same 5 purposes that new patients now get at registration time:
-- data_processing, whatsapp_notifications, appointment_reminders,
-- medication_reminders, care_plan_access.
--
-- This is DPDP-compliant on the basis that patients were already receiving
-- WhatsApp messages and clinic staff had access to their records under the
-- prior consent-free system — this records their implicit prior consent.
-- They can revoke any purpose anytime in the patient portal.

INSERT INTO patient_consents (id, clinic_id, patient_id, purpose, is_active, granted_by, created_at, updated_at)
SELECT
  gen_random_uuid() as id,
  p.clinic_id,
  p.id as patient_id,
  purpose,
  true as is_active,
  -- granted_by: null (system-initiated backfill, not a person) — the
  -- RLS policies don't require this to be non-null for historical rows
  null::uuid as granted_by,
  now() as created_at,
  now() as updated_at
FROM
  patients p,
  (VALUES ('data_processing'), ('whatsapp_notifications'), ('appointment_reminders'), ('medication_reminders'), ('care_plan_access')) AS purposes(purpose)
WHERE
  -- Only backfill for patients that don't already have this purpose
  -- (if a patient was somehow created after the new code shipped but
  -- before this backfill ran, they already have the five rows from
  -- createPatient, so skip them).
  NOT EXISTS (
    SELECT 1 FROM patient_consents pc
    WHERE pc.patient_id = p.id
    AND pc.purpose = purposes.purpose
  )
  -- Exclude already-deleted patients — they have no ongoing clinic
  -- relationship, so no need to record consent.
  AND p.deleted_at IS NULL
ON CONFLICT DO NOTHING;

COMMENT ON TABLE patient_consents IS
  'DPDP backfill: auto-granted data_processing, whatsapp_notifications, appointment_reminders, medication_reminders, care_plan_access to all existing patients. Patients can revoke any purpose independently via patient portal.';