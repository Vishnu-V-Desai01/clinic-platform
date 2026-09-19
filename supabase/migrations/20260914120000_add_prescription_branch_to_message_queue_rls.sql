-- 20260914120000_add_prescription_branch_to_message_queue_rls.sql
--
-- ITEM 2 FIX: message_queue_doctor_scoped_select never had a branch for
-- type = 'prescription'. For any non-admin doctor, every existing OR
-- condition (appointment / receipt+medicine_receipt / registration)
-- evaluates false for a prescription row, so the policy unconditionally
-- blocked doctors from reading back a prescription message row they had
-- just inserted via createPrescriptionMessage(). sendMessage()'s own
-- fresh SELECT by id (required since the insert deliberately skips a
-- .select() re-read -- see comment in messaging/actions.ts) was hitting
-- this gap and returning "Message not found" for every doctor-initiated
-- "Send Prescription", regardless of who the patient's assigned doctor
-- actually was.
--
-- Mirrors the existing 'registration' branch exactly: prescriptions have
-- no payment/appointment of their own to key visibility off, so fall
-- back to the patient's assigned_doctor_id, matching the application-
-- level isMessageVisibleToDoctor() check in messaging/actions.ts (which
-- already had this branch -- only the DB policy was missing it).
--
-- Staff and admins are unaffected (already bypass via the first two OR
-- clauses in the policy). Additive: replaces the policy definition only,
-- does not touch table structure or loosen any existing branch.

drop policy if exists message_queue_doctor_scoped_select on public.message_queue;

create policy message_queue_doctor_scoped_select
on public.message_queue
for select
using (
  (get_my_role() <> 'doctor'::text)
  or get_my_is_admin()
  or (
    (type = 'appointment'::text)
    and exists (
      select 1 from appointments a
      where a.id = message_queue.appointment_id
        and a.doctor_id = get_my_profile_id()
    )
  )
  or (
    (type = any (array['receipt'::text, 'medicine_receipt'::text]))
    and exists (
      select 1 from payments p
      where p.id = message_queue.payment_id
        and p.doctor_id = get_my_profile_id()
    )
  )
  or (
    (type = any (array['registration'::text, 'prescription'::text]))
    and exists (
      select 1 from patients pt
      where pt.id = message_queue.patient_id
        and pt.assigned_doctor_id = get_my_profile_id()
    )
  )
);