-- supabase/migrations/20260828150000_scope_by_record_doctor_not_assignment.sql
--
-- Re-scopes doctor visibility from "patient's assigned_doctor_id" to
-- "doctor is the actual actor on this specific record." Appointments,
-- payments, and appointment/receipt messages are now visible to whichever
-- doctor is on THAT record, not just the patient's primary assigned doctor.
-- Registration messages have no per-record doctor, so they fall back to
-- assigned_doctor_id (the patient's primary doctor).
--
-- Supersedes the assigned_doctor_id-only scoping shipped in Issues 2/3,
-- after discovering Doctor B could have a legitimate appointment with
-- Doctor A's patient and needed to see that appointment/payment/message
-- without being the patient's primary doctor.

-- 1. patients: broaden doctor visibility exemption for SELECT only
--    (UPDATE stays assigned-doctor-only — see note below)
DROP POLICY IF EXISTS patients_doctor_sees_assigned_only ON patients;

CREATE POLICY patients_doctor_sees_assigned_only
ON patients
AS RESTRICTIVE
FOR SELECT
USING (
  (get_my_role() <> 'doctor')
  OR get_my_is_admin()
  OR (assigned_doctor_id = get_my_profile_id())
  OR EXISTS (
    SELECT 1 FROM appointments a
    WHERE a.patient_id = patients.id
    AND a.doctor_id = get_my_profile_id()
    AND a.deleted_at IS NULL
  )
  OR EXISTS (
    SELECT 1 FROM payments p
    WHERE p.patient_id = patients.id
    AND p.doctor_id = get_my_profile_id()
  )
);

-- patients_doctor_updates_assigned_only (UPDATE) intentionally left
-- unchanged: editing a patient's core record stays limited to their
-- primary assigned doctor + admin, not any doctor who's ever had an
-- appointment or payment with them. This is a deliberate asymmetry —
-- seeing a patient you've treated is fine; editing their master record
-- is a different, narrower permission. Flag if you want this broadened too.

-- 2. payments: scope by payments.doctor_id directly, not via a patients join
DROP POLICY IF EXISTS payments_select_clinic_staff_doctor ON payments;

CREATE POLICY payments_select_clinic_staff_doctor
ON payments
FOR SELECT
USING (
  clinic_id = get_my_clinic_id()
  AND (
    get_my_role() = 'staff'
    OR get_my_is_admin()
    OR (get_my_role() = 'doctor' AND doctor_id = get_my_profile_id())
  )
);

-- 3. message_queue: scope per message type by the relevant record's doctor
DROP POLICY IF EXISTS message_queue_doctor_scoped_select ON message_queue;

CREATE POLICY message_queue_doctor_scoped_select
ON message_queue
AS RESTRICTIVE
FOR SELECT
USING (
  (get_my_role() <> 'doctor')
  OR get_my_is_admin()
  OR (
    type = 'appointment' AND EXISTS (
      SELECT 1 FROM appointments a
      WHERE a.id = message_queue.appointment_id
      AND a.doctor_id = get_my_profile_id()
    )
  )
  OR (
    type IN ('receipt', 'medicine_receipt') AND EXISTS (
      SELECT 1 FROM payments p
      WHERE p.id = message_queue.payment_id
      AND p.doctor_id = get_my_profile_id()
    )
  )
  OR (
    type = 'registration' AND EXISTS (
      SELECT 1 FROM patients pt
      WHERE pt.id = message_queue.patient_id
      AND pt.assigned_doctor_id = get_my_profile_id()
    )
  )
);

DROP POLICY IF EXISTS message_queue_doctor_scoped_update ON message_queue;

CREATE POLICY message_queue_doctor_scoped_update
ON message_queue
AS RESTRICTIVE
FOR UPDATE
USING (
  (get_my_role() <> 'doctor')
  OR get_my_is_admin()
  OR (
    type = 'appointment' AND EXISTS (
      SELECT 1 FROM appointments a
      WHERE a.id = message_queue.appointment_id
      AND a.doctor_id = get_my_profile_id()
    )
  )
  OR (
    type IN ('receipt', 'medicine_receipt') AND EXISTS (
      SELECT 1 FROM payments p
      WHERE p.id = message_queue.payment_id
      AND p.doctor_id = get_my_profile_id()
    )
  )
  OR (
    type = 'registration' AND EXISTS (
      SELECT 1 FROM patients pt
      WHERE pt.id = message_queue.patient_id
      AND pt.assigned_doctor_id = get_my_profile_id()
    )
  )
);