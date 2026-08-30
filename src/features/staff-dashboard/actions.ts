"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/supabase/profile";
import type {
  PendingRequestItem,
  TodayAppointmentItem,
  NoPortalPatientItem,
  OutstandingPaymentItem,
  RemindersDueSummary,
  DoctorOption,
  TimeSlot,
} from "./types";
import {
  confirmAppointmentRequestSchema,
  rejectAppointmentRequestSchema,
  updatePatientEmailSchema,
  type ConfirmAppointmentRequestInput,
  type RejectAppointmentRequestInput,
  type UpdatePatientEmailInput,
} from "./schema";

// ---------------------------------------------------------------------------
// IST date helpers.
// The DB stores appointment_date as timestamptz (UTC under the hood) but
// preferred_date / start_date / end_date are plain `date` columns with no
// timezone attached. We never trust the server's local timezone — every
// "today" is computed via an explicit UTC+5:30 offset, per project convention.
// ---------------------------------------------------------------------------

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Returns the IST calendar date (YYYY-MM-DD) for "today", offset by N days. */
function getISTDateString(offsetDays = 0): string {
  const istNow = new Date(Date.now() + IST_OFFSET_MS);
  istNow.setUTCDate(istNow.getUTCDate() + offsetDays);
  return istNow.toISOString().slice(0, 10);
}

/**
 * Returns the [start, end] UTC instants that bound "today" in IST.
 * Used for filtering timestamptz columns (appointment_date) to a calendar day.
 */
function getISTDayBoundsUTC(offsetDays = 0): { startUTC: string; endUTC: string } {
  const istNow = new Date(Date.now() + IST_OFFSET_MS);
  istNow.setUTCDate(istNow.getUTCDate() + offsetDays);
  const y = istNow.getUTCFullYear();
  const m = istNow.getUTCMonth();
  const d = istNow.getUTCDate();

  const startUTC = new Date(Date.UTC(y, m, d, 0, 0, 0, 0) - IST_OFFSET_MS);
  const endUTC = new Date(Date.UTC(y, m, d, 23, 59, 59, 999) - IST_OFFSET_MS);

  return { startUTC: startUTC.toISOString(), endUTC: endUTC.toISOString() };
}

/**
 * Returns the [start, end] UTC instants bounding the IST calendar day that
 * `isoInstant` falls on. Used to scope the overlap-check query to "that
 * doctor's day" without pulling their entire appointment history.
 */
function getISTDayBoundsForInstantUTC(isoInstant: string): { startUTC: string; endUTC: string } {
  const instant = new Date(isoInstant);
  const istInstant = new Date(instant.getTime() + IST_OFFSET_MS);
  const y = istInstant.getUTCFullYear();
  const m = istInstant.getUTCMonth();
  const d = istInstant.getUTCDate();

  const startUTC = new Date(Date.UTC(y, m, d, 0, 0, 0, 0) - IST_OFFSET_MS);
  const endUTC = new Date(Date.UTC(y, m, d, 23, 59, 59, 999) - IST_OFFSET_MS);

  return { startUTC: startUTC.toISOString(), endUTC: endUTC.toISOString() };
}

// ---------------------------------------------------------------------------
// Panel 1: Pending appointment requests (from the patient portal)
// ---------------------------------------------------------------------------

export async function listPendingAppointmentRequests(): Promise<PendingRequestItem[]> {
  const profile = await requireRole("staff", "doctor");
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("appointment_requests")
    .select(
      `
      id,
      patient_id,
      preferred_date,
      preferred_time_slot,
      reason,
      created_at,
      patients:patient_id ( first_name, last_name, phone )
    `
    )
    .eq("clinic_id", profile.clinic_id)
    .eq("status", "pending")
    .order("preferred_date", { ascending: true });

  if (error) {
    throw new Error(`Failed to load pending requests: ${error.message}`);
  }

  return (data ?? []).map((row: any) => ({
    id: row.id,
    patientId: row.patient_id,
    patientName: `${row.patients?.first_name ?? ""} ${row.patients?.last_name ?? ""}`.trim(),
    patientPhone: row.patients?.phone ?? "",
    preferredDate: row.preferred_date,
    preferredTimeSlot: (row.preferred_time_slot as TimeSlot) ?? null,
    reason: row.reason,
    createdAt: row.created_at,
  }));
}

// ---------------------------------------------------------------------------
// Panel 2: Today's appointments (IST calendar day)
// ---------------------------------------------------------------------------

export async function listTodaysAppointments(): Promise<TodayAppointmentItem[]> {
  const profile = await requireRole("staff", "doctor");
  const supabase = await createServerSupabaseClient();
  const { startUTC, endUTC } = getISTDayBoundsUTC(0);

  const { data, error } = await supabase
    .from("appointments")
    .select(
      `
      id,
      patient_id,
      doctor_id,
      appointment_date,
      duration_minutes,
      status,
      chief_complaint,
      patients:patient_id ( first_name, last_name ),
      doctor:doctor_id ( full_name )
    `
    )
    .eq("clinic_id", profile.clinic_id)
    .is("deleted_at", null)
    .gte("appointment_date", startUTC)
    .lte("appointment_date", endUTC)
    .order("appointment_date", { ascending: true });

  if (error) {
    throw new Error(`Failed to load today's appointments: ${error.message}`);
  }

  return (data ?? []).map((row: any) => ({
    id: row.id,
    patientId: row.patient_id,
    patientName: `${row.patients?.first_name ?? ""} ${row.patients?.last_name ?? ""}`.trim(),
    doctorId: row.doctor_id,
    doctorName: row.doctor?.full_name ?? "",
    appointmentDate: row.appointment_date,
    durationMinutes: row.duration_minutes ?? 30,
    status: row.status,
    chiefComplaint: row.chief_complaint,
  }));
}

// ---------------------------------------------------------------------------
// Panel 3: Patients without portal access (missing email)
// ---------------------------------------------------------------------------

export async function listPatientsWithoutPortalAccess(): Promise<NoPortalPatientItem[]> {
  const profile = await requireRole("staff", "doctor");
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("patients")
    .select("id, first_name, last_name, phone, patient_id_number, created_at")
    .eq("clinic_id", profile.clinic_id)
    .is("deleted_at", null)
    .is("email", null)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    throw new Error(`Failed to load patients without portal access: ${error.message}`);
  }

  return (data ?? []).map((row: any) => ({
    id: row.id,
    patientName: `${row.first_name} ${row.last_name}`.trim(),
    phone: row.phone,
    patientIdNumber: row.patient_id_number,
    createdAt: row.created_at,
  }));
}

// ---------------------------------------------------------------------------
// Panel 4: Outstanding payments
// ---------------------------------------------------------------------------

export async function listOutstandingPayments(): Promise<OutstandingPaymentItem[]> {
  const profile = await requireRole("staff", "doctor");
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("payments")
    .select(
      `
      id,
      patient_id,
      amount_charged,
      amount_paid,
      outstanding_balance,
      payment_status,
      is_overdue,
      created_at,
      patients:patient_id ( first_name, last_name )
    `
    )
    .eq("clinic_id", profile.clinic_id)
    .gt("outstanding_balance", 0)
    .order("is_overdue", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to load outstanding payments: ${error.message}`);
  }

  return (data ?? []).map((row: any) => ({
    id: row.id,
    patientId: row.patient_id,
    patientName: `${row.patients?.first_name ?? ""} ${row.patients?.last_name ?? ""}`.trim(),
    amountCharged: Number(row.amount_charged),
    amountPaid: Number(row.amount_paid),
    outstandingBalance: Number(row.outstanding_balance),
    paymentStatus: row.payment_status,
    isOverdue: row.is_overdue,
    createdAt: row.created_at,
  }));
}

// ---------------------------------------------------------------------------
// Panel 5: Reminders due today — BEST-EFFORT PREVIEW ONLY.
//
// `reminders` is a send-log (sent_at defaults to now), not a schedule.
// The real schedule lives in care_plan_reminders. This count is a
// best-effort read of "how many active reminder schedules cover today's
// IST date" — it does NOT exclude ones the cron has already sent earlier
// today, and does NOT replicate the cron's exact due-time logic. It exists
// purely as a glance-able number for staff, with no action attached.
// If this proves misleading in practice, revisit in Chat 24.
// ---------------------------------------------------------------------------

export async function getRemindersDueTodayCount(): Promise<RemindersDueSummary> {
  const profile = await requireRole("staff", "doctor");
  const supabase = await createServerSupabaseClient();
  const today = getISTDateString(0);

  const { count, error } = await supabase
    .from("care_plan_reminders")
    .select("id", { count: "exact", head: true })
    .eq("clinic_id", profile.clinic_id)
    .eq("enabled", true)
    .lte("start_date", today)
    .or(`end_date.is.null,end_date.gte.${today}`);

  if (error) {
    throw new Error(`Failed to load reminders due count: ${error.message}`);
  }

  return { count: count ?? 0 };
}

// ---------------------------------------------------------------------------
// Panel 6 (Chat C, objective 6): recent medicine sales, doctor-attributed.
//
// Thin pass-through to the pharmacy feature's action — kept here so this
// dashboard's data-fetching stays centralized in one file, same as every
// other panel above. Lazily imported (not a top-level import) to avoid
// pulling the entire pharmacy feature into this module's dependency graph
// for consumers that never call this function.
//
// Doctor attribution is whatever payments.doctor_id holds — set to the
// PRESCRIBING doctor by dispenseAndBillEncounter, not the dispensing user.
// Fails soft (returns []) rather than throwing: a clinic with the pharmacy
// module disabled, or with pharmacy_access not yet granted to anyone, should
// not break the rest of this shared dashboard.
// ---------------------------------------------------------------------------

export async function listRecentMedicineSales() {
  await requireRole("staff", "doctor");
  const { getRecentMedicineSales } = await import("@/features/pharmacy/actions");
  const result = await getRecentMedicineSales(10);
  if (!result.ok) {
    return [];
  }
  return result.data;
}

// ---------------------------------------------------------------------------
// Confirm a pending request: create the real appointment, then close out
// the request. Staff and doctors both do this directly — no cross-approval.
// ---------------------------------------------------------------------------

export async function confirmAppointmentRequest(
  input: ConfirmAppointmentRequestInput
): Promise<{ appointmentId: string }> {
  const profile = await requireRole("staff", "doctor");
  const parsed = confirmAppointmentRequestSchema.safeParse(input);

  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  }

  const { requestId, doctorId, appointmentDate, durationMinutes, chiefComplaint } = parsed.data;
  const supabase = await createServerSupabaseClient();

  // Confirm the request still exists, is pending, and belongs to this clinic.
  const { data: requestRow, error: requestError } = await supabase
    .from("appointment_requests")
    .select("id, patient_id, status")
    .eq("id", requestId)
    .eq("clinic_id", profile.clinic_id)
    .maybeSingle();

  if (requestError) {
    throw new Error(`Failed to load request: ${requestError.message}`);
  }
  if (!requestRow) {
    throw new Error("Appointment request not found.");
  }
  if (requestRow.status !== "pending") {
    throw new Error("This request has already been responded to.");
  }

  // Double-booking guard: reject if the requested [start, start+duration]
  // window overlaps ANY other non-cancelled appointment for this doctor,
  // not just an exact-time collision. We scope the query to the doctor's
  // IST calendar day, then check true interval overlap in code.
  const newStart = new Date(appointmentDate).getTime();
  const newEnd = newStart + durationMinutes * 60 * 1000;
  const { startUTC: dayStart, endUTC: dayEnd } = getISTDayBoundsForInstantUTC(appointmentDate);

  const { data: sameDayAppointments, error: clashError } = await supabase
    .from("appointments")
    .select("id, appointment_date, duration_minutes")
    .eq("clinic_id", profile.clinic_id)
    .eq("doctor_id", doctorId)
    .neq("status", "cancelled")
    .is("deleted_at", null)
    .gte("appointment_date", dayStart)
    .lte("appointment_date", dayEnd);

  if (clashError) {
    throw new Error(`Failed to check for scheduling conflicts: ${clashError.message}`);
  }

  const hasOverlap = (sameDayAppointments ?? []).some((row) => {
    const existingStart = new Date(row.appointment_date).getTime();
    const existingEnd = existingStart + (row.duration_minutes ?? 30) * 60 * 1000;
    return newStart < existingEnd && existingStart < newEnd;
  });

  if (hasOverlap) {
    throw new Error(
      "This doctor already has an appointment that overlaps this time slot. Please choose a different time."
    );
  }

  // Create the appointment.
  const { data: newAppointment, error: insertError } = await supabase
    .from("appointments")
    .insert({
      clinic_id: profile.clinic_id,
      patient_id: requestRow.patient_id,
      doctor_id: doctorId,
      appointment_date: appointmentDate,
      duration_minutes: durationMinutes,
      status: "scheduled",
      chief_complaint: chiefComplaint ?? null,
    })
    .select("id")
    .single();

  if (insertError || !newAppointment) {
    throw new Error(`Failed to create appointment: ${insertError?.message}`);
  }

  // Close out the request.
  const { error: updateError } = await supabase
    .from("appointment_requests")
    .update({
      status: "confirmed",
      confirmed_appointment_id: newAppointment.id,
      responded_by: profile.id,
      responded_at: new Date().toISOString(),
    })
    .eq("id", requestId);

  if (updateError) {
    // The appointment was already created — surface this clearly rather
    // than silently leaving the request stuck at "pending".
    throw new Error(
      `Appointment was created, but the request could not be marked confirmed: ${updateError.message}. Please refresh and check manually.`
    );
  }

  revalidatePath("/dashboard/overview");

  return { appointmentId: newAppointment.id };
}

// ---------------------------------------------------------------------------
// Reject a pending request.
// ---------------------------------------------------------------------------

export async function rejectAppointmentRequest(
  input: RejectAppointmentRequestInput
): Promise<void> {
  const profile = await requireRole("staff", "doctor");
  const parsed = rejectAppointmentRequestSchema.safeParse(input);

  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  }

  const { requestId, responseNote } = parsed.data;
  const supabase = await createServerSupabaseClient();

  const { data: requestRow, error: requestError } = await supabase
    .from("appointment_requests")
    .select("id, status")
    .eq("id", requestId)
    .eq("clinic_id", profile.clinic_id)
    .maybeSingle();

  if (requestError) {
    throw new Error(`Failed to load request: ${requestError.message}`);
  }
  if (!requestRow) {
    throw new Error("Appointment request not found.");
  }
  if (requestRow.status !== "pending") {
    throw new Error("This request has already been responded to.");
  }

  const { error: updateError } = await supabase
    .from("appointment_requests")
    .update({
      status: "rejected",
      response_note: responseNote,
      responded_by: profile.id,
      responded_at: new Date().toISOString(),
    })
    .eq("id", requestId);

  if (updateError) {
    throw new Error(`Failed to reject request: ${updateError.message}`);
  }

  revalidatePath("/dashboard/overview");
}

// ---------------------------------------------------------------------------
// Doctors for the "Assign Doctor" dropdown on the confirm dialog.
// ---------------------------------------------------------------------------

export async function listClinicDoctors(): Promise<DoctorOption[]> {
  const profile = await requireRole("staff", "doctor");
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("clinic_id", profile.clinic_id)
    .eq("role", "doctor")
    .order("full_name", { ascending: true });

  if (error) {
    throw new Error(`Failed to load doctors: ${error.message}`);
  }

  return (data ?? []).map((row: any) => ({
    id: row.id,
    name: row.full_name ?? "Unnamed Doctor",
  }));
}

// ---------------------------------------------------------------------------
// Add a missing email to a patient record.
//
// NOTE ON family_account_id LINKING: the auto-link trigger from Chat 18 was
// documented as firing "when email is provided at registration" — which
// reads as INSERT-only. This UPDATE may or may not trigger it. To stay
// correct either way without assuming DB internals, we re-check after the
// update: if family_account_id is still null and a family_accounts row
// exists for this email, we link it explicitly here. If the DB trigger
// already handled it, this second check is a harmless no-op (WHERE clause
// won't match). Confirm the trigger's actual behavior in Supabase when you
// get a chance — if it turns out to fire on UPDATE too, this fallback
// simply never fires and can stay as a safety net.
// ---------------------------------------------------------------------------

export async function updatePatientEmail(input: UpdatePatientEmailInput): Promise<void> {
  const profile = await requireRole("staff", "doctor");
  const parsed = updatePatientEmailSchema.safeParse(input);

  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  }

  const { patientId, email } = parsed.data;
  const supabase = await createServerSupabaseClient();

  const { data: patientRow, error: patientError } = await supabase
    .from("patients")
    .select("id, family_account_id")
    .eq("id", patientId)
    .eq("clinic_id", profile.clinic_id)
    .is("deleted_at", null)
    .maybeSingle();

  if (patientError) {
    throw new Error(`Failed to load patient: ${patientError.message}`);
  }
  if (!patientRow) {
    throw new Error("Patient not found.");
  }

  const { error: updateError } = await supabase
    .from("patients")
    .update({ email })
    .eq("id", patientId);

  if (updateError) {
    if (updateError.code === "23505") {
      throw new Error("Another patient in this clinic is already using that email.");
    }
    throw new Error(`Failed to update email: ${updateError.message}`);
  }

  // Fallback link check — see note above.
  if (!patientRow.family_account_id) {
    const { data: familyAccount } = await supabase
      .from("family_accounts")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (familyAccount) {
      await supabase
        .from("patients")
        .update({ family_account_id: familyAccount.id })
        .eq("id", patientId)
        .is("family_account_id", null); // don't clobber if trigger already set it
    }
  }

  revalidatePath("/dashboard/overview");
}