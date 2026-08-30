// src/features/messaging/actions.ts
"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/supabase/profile";
import { generateAndStorePaymentDocuments } from "@/features/payments/document-storage";
import { INCLUDED_MESSAGE_LIMIT, OVERAGE_RATE_PAISE } from "@/lib/config/messaging";
import {
  createRegistrationMessageInputSchema,
  createAppointmentMessageInputSchema,
  createReceiptMessageInputSchema,
  sendMessageInputSchema,
  sendAllMessagesInputSchema,
  cancelMessageInputSchema,
  messagePlaceholdersSchema,
} from "./schema";
import type {
  RegistrationPlaceholders,
  AppointmentPlaceholders,
  ReceiptPlaceholders,
  CreateRegistrationMessageInput,
  CreateAppointmentMessageInput,
  CreateReceiptMessageInput,
  SendMessageInput,
  SendAllMessagesInput,
  CancelMessageInput,
} from "./types";
import { getMessageProvider } from "./providers";
import { buildBodyParams, getProviderTemplateName } from "./provider-mapping";
import { getLocalTimeAsUtc } from "./utils";
import {
  getOrCreateActivePublicLink,
  regenerateDocumentLink,
  buildPublicDocumentUrl,
} from "./document-links";

// Country code mapping for phone number formatting
const COUNTRY_CODE_MAP: Record<string, string> = {
  'IN': '91',
  'US': '1',
  'GB': '44',
  'AE': '971',
  'SA': '966',
  'AU': '61',
  'NZ': '64',
};

function formatPhoneWithCountryCode(phone: string, countryCode: string): string {
  const code = COUNTRY_CODE_MAP[countryCode] || '91';
  return phone.startsWith(code) ? phone : `${code}${phone}`;
}

// ── Message visibility scoping (Issue 3, re-scoped) ────────────────
//
// Visibility now mirrors WHICH doctor the message's underlying record
// actually belongs to, not the patient's primary assignment — matching
// the re-scoped patients/payments policies. A doctor sees:
//   - 'appointment' messages: where the linked appointment's doctor_id = them
//   - 'receipt' / 'medicine_receipt' messages: where the linked payment's
//     doctor_id = them
//   - 'registration' messages: where the patient's assigned_doctor_id = them
//     (registration has no appointment/payment to key off of, so it falls
//     back to primary assignment)
// Admin and staff see everything, unrestricted.
//
// getMessageClusters relies on the message_queue_doctor_scoped_select RLS
// policy (which implements this exact same type-conditional logic at the
// database layer) rather than duplicating it in application code — the
// list queries below are correct as long as RLS is correct, without a
// parallel per-type filter that could drift out of sync with the policy.
//
// isMessageVisibleToDoctor is used ONLY for sendMessage/cancelMessage —
// single-record mutations where an explicit ownership check is worth the
// extra query as defence in depth, even though RLS already covers it.
async function isMessageVisibleToDoctor(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  profile: { id: string; role: string; is_clinic_admin: boolean },
  message: { type: string; patient_id: string; appointment_id: string | null; payment_id: string | null }
): Promise<boolean> {
  if (profile.is_clinic_admin || profile.role === 'staff') return true;

  if (message.type === 'appointment') {
    if (!message.appointment_id) return false;
    const { data } = await supabase
      .from('appointments')
      .select('id')
      .eq('id', message.appointment_id)
      .eq('doctor_id', profile.id)
      .maybeSingle();
    return !!data;
  }

  if (message.type === 'receipt' || message.type === 'medicine_receipt') {
    if (!message.payment_id) return false;
    const { data } = await supabase
      .from('payments')
      .select('id')
      .eq('id', message.payment_id)
      .eq('doctor_id', profile.id)
      .maybeSingle();
    return !!data;
  }

  if (message.type === 'registration') {
    const { data } = await supabase
      .from('patients')
      .select('id')
      .eq('id', message.patient_id)
      .eq('assigned_doctor_id', profile.id)
      .maybeSingle();
    return !!data;
  }

  // Unknown message type: fail closed rather than assume visibility.
  console.error('[isMessageVisibleToDoctor] unrecognized message type:', message.type);
  return false;
}

export type ReadyMessage = {
  id: string;
  patientName: string;
  phone: string;
  type: string;
  language: string;
  status: string;
  createdAt: string;
};

export type ScheduledReminder = {
  id: string;
  patientName: string;
  doctorName: string;
  appointmentDate: string;
  appointmentTime: string;
  scheduledSendTime: string;
  status: string;
};

export type ArchiveMessage = {
  id: string;
  patientName: string;
  messageType: string;
  status: "sent" | "failed" | "cancelled" | "expired";
  timestamp: string;
  failureReason: string | null;
};

// ============================================================================
// createRegistrationMessage
// ============================================================================
export async function createRegistrationMessage(input: CreateRegistrationMessageInput) {
  const profile = await requireRole("doctor", "staff");
  const { patientId } = createRegistrationMessageInputSchema.parse(input);
  const supabase = createServerSupabaseClient();

  const { data: existingMessage } = await supabase
    .from("message_queue")
    .select("id")
    .eq("patient_id", patientId)
    .eq("type", "registration")
    .in("status", ["pending", "sent"])
    .maybeSingle();

  if (existingMessage) {
    return { success: true, messageId: existingMessage.id, alreadyExisted: true };
  }

  const { data: patient, error: patientError } = await supabase
    .from("patients")
    .select("id, clinic_id, first_name, last_name, email, phone, language_preference")
    .eq("id", patientId)
    .single();

  if (patientError || !patient) {
    return { success: false, error: "Patient not found" };
  }

  if (!patient.phone) {
    return { success: false, error: "Patient has no phone number on file" };
  }

  if (!patient.email) {
    return { success: false, error: "Patient has no email on file" };
  }

  const { data: clinic, error: clinicError } = await supabase
    .from("clinics")
    .select("id, name, country_code")
    .eq("id", patient.clinic_id)
    .single();

  if (clinicError || !clinic) {
    return { success: false, error: "Clinic not found" };
  }

  const phoneWithCountryCode = formatPhoneWithCountryCode(
    patient.phone,
    clinic.country_code || 'IN'
  );

  const placeholders: RegistrationPlaceholders = {
    CLINIC_NAME: clinic.name,
    PATIENT_NAME: `${patient.first_name} ${patient.last_name}`,
    EMAIL: patient.email,
   LOGIN_LINK: `${process.env.NEXT_PUBLIC_APP_URL}/patient-portal`,
  };

  // Generate the id client-side and skip the post-insert .select() re-read.
  // Supabase's .insert().select() pattern immediately re-selects the row
  // it just wrote, and that re-select is subject to the same RESTRICTIVE
  // SELECT policy (message_queue_doctor_scoped_select) as any other read —
  // for a caller who doesn't satisfy that policy for THIS message's type
  // (e.g. a doctor who isn't the treating doctor, triggering this
  // indirectly), the write succeeds but the re-select fails, and Postgres
  // reports that as "row violates policy" even though the insert worked.
  // Knowing the id upfront avoids the re-select entirely — this is a
  // system-initiated queue insert, not a user-facing read, so there's
  // nothing lost by not reading it back.
  const registrationMessageId = crypto.randomUUID();

  const { error: insertError } = await supabase
    .from("message_queue")
    .insert({
      id: registrationMessageId,
      clinic_id: patient.clinic_id,
      patient_id: patient.id,
      type: "registration",
      // Item 5: registration has five seeded language templates, but only
      // the English one (curakin_registration_en) is approved by Meta —
      // the other four have never gone live. Sending in any other language
      // fails at the provider, so this is forced to "en" regardless of the
      // patient's language_preference. Revert to
      // `language: patient.language_preference` once the remaining four
      // languages are approved. (Audited alongside this: appointment,
      // receipt, and medicine_receipt all have all 5 languages approved,
      // so those send paths correctly keep using language_preference and
      // are NOT forced to English.)
      language: "en",
      phone: phoneWithCountryCode,
      placeholders,
      status: "pending",
      scheduled_send_time: new Date().toISOString(),
      created_by: profile.id,
    });

  if (insertError) {
    return { success: false, error: insertError.message ?? "Failed to queue registration message" };
  }

  await supabase.from("message_delivery_logs").insert({
    clinic_id: patient.clinic_id,
    message_queue_id: registrationMessageId,
    action: "created",
    performed_by: profile.id,
  });

  revalidatePath("/dashboard/messages");
  return { success: true, messageId: registrationMessageId };
}

// ============================================================================
// createAppointmentMessage
// ============================================================================
export async function createAppointmentMessage(input: CreateAppointmentMessageInput) {
  const profile = await requireRole("doctor", "staff");
  const { appointmentId } = createAppointmentMessageInputSchema.parse(input);
  const supabase = createServerSupabaseClient();

  const { data: appointment, error: appointmentError } = await supabase
    .from("appointments")
    .select("id, clinic_id, patient_id, doctor_id, appointment_date, status")
    .eq("id", appointmentId)
    .single();

  if (appointmentError || !appointment) {
    return { success: false, error: "Appointment not found" };
  }

  if (appointment.status !== "scheduled") {
    return { success: false, error: `Cannot queue a reminder for a ${appointment.status} appointment` };
  }

  const { data: existing } = await supabase
    .from("message_queue")
    .select("id")
    .eq("appointment_id", appointmentId)
    .eq("status", "pending")
    .maybeSingle();

  if (existing) {
    return { success: true, messageId: existing.id, alreadyExisted: true };
  }

  const { data: patient, error: patientError } = await supabase
    .from("patients")
    .select("id, first_name, last_name, phone, language_preference")
    .eq("id", appointment.patient_id)
    .single();

  if (patientError || !patient) {
    return { success: false, error: "Patient not found" };
  }

  if (!patient.phone) {
    return { success: false, error: "Patient has no phone number on file" };
  }

  const { data: clinic, error: clinicError } = await supabase
    .from("clinics")
    .select("id, name, phone, timezone, country_code")
    .eq("id", appointment.clinic_id)
    .single();

  if (clinicError || !clinic) {
    return { success: false, error: "Clinic not found" };
  }

  const phoneWithCountryCode = formatPhoneWithCountryCode(
    patient.phone,
    clinic.country_code || 'IN'
  );

  const { data: doctorProfile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", appointment.doctor_id)
    .maybeSingle();

  const appointmentDate = new Date(appointment.appointment_date);
  const timeZone = clinic.timezone || "Asia/Kolkata";

  const formattedDate = appointmentDate.toLocaleDateString("en-IN", {
    timeZone,
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const formattedTime = appointmentDate.toLocaleTimeString("en-IN", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  const placeholders: AppointmentPlaceholders = {
    PATIENT_NAME: `${patient.first_name} ${patient.last_name}`,
    DOCTOR_NAME: doctorProfile?.full_name ?? "your doctor",
    CLINIC_NAME: clinic.name,
    APPOINTMENT_DATE: formattedDate,
    APPOINTMENT_TIME: formattedTime,
    DASHBOARD_LINK: `${process.env.NEXT_PUBLIC_APP_URL}/patient/dashboard/messages`,
    CLINIC_PHONE: clinic.phone ?? "the clinic",
  };

  const computed = getLocalTimeAsUtc(appointmentDate, timeZone, 4, 30);
  const scheduledSendTime = computed < new Date() ? new Date() : computed;

  // See the comment on the equivalent insert in createRegistrationMessage
  // above — generating the id client-side avoids a post-insert re-select
  // that would otherwise be subject to message_queue_doctor_scoped_select
  // RLS. This one matters especially here: rescheduleAppointment calls
  // this function, and the caller triggering a reschedule is not
  // necessarily the appointment's treating doctor.
  const appointmentMessageId = crypto.randomUUID();

  const { error: insertError } = await supabase
    .from("message_queue")
    .insert({
      id: appointmentMessageId,
      clinic_id: appointment.clinic_id,
      patient_id: patient.id,
      appointment_id: appointment.id,
      type: "appointment",
      language: patient.language_preference,
      phone: phoneWithCountryCode,
      placeholders,
      status: "pending",
      scheduled_send_time: scheduledSendTime.toISOString(),
      expires_at: appointment.appointment_date,
      created_by: profile.id,
    });

  if (insertError) {
    return { success: false, error: insertError.message ?? "Failed to queue appointment message" };
  }

  await supabase.from("message_delivery_logs").insert({
    clinic_id: appointment.clinic_id,
    message_queue_id: appointmentMessageId,
    action: "created",
    performed_by: profile.id,
  });

  revalidatePath("/dashboard/messages");
  return { success: true, messageId: appointmentMessageId };
}

// ============================================================================
// createReceiptMessage
// ============================================================================
export async function createReceiptMessage(input: CreateReceiptMessageInput) {
  const profile = await requireRole("doctor", "staff");
  const { paymentId } = createReceiptMessageInputSchema.parse(input);
  const supabase = createServerSupabaseClient();

  const { data: existingMessage } = await supabase
    .from("message_queue")
    .select("id")
    .eq("payment_id", paymentId)
    .eq("type", "receipt")
    .in("status", ["pending", "sent"])
    .maybeSingle();

  if (existingMessage) {
    return { success: true, messageId: existingMessage.id, alreadyExisted: true };
  }

  const { data: payment, error: paymentError } = await supabase
    .from("payments")
    .select("id, clinic_id, patient_id, approval_status")
    .eq("id", paymentId)
    .single();

  if (paymentError || !payment) {
    return { success: false, error: "Payment not found" };
  }

  if (payment.approval_status !== "approved") {
    return { success: false, error: "Cannot send receipt message — payment has not been approved yet" };
  }

  const { data: patient, error: patientError } = await supabase
    .from("patients")
    .select("id, first_name, last_name, phone, language_preference")
    .eq("id", payment.patient_id)
    .single();

  if (patientError || !patient) {
    return { success: false, error: "Patient not found" };
  }

  if (!patient.phone) {
    return { success: false, error: "Patient has no phone number on file" };
  }

  const { data: clinic, error: clinicError } = await supabase
    .from("clinics")
    .select("id, name, country_code")
    .eq("id", payment.clinic_id)
    .single();

  if (clinicError || !clinic) {
    return { success: false, error: "Clinic not found" };
  }

  const phoneWithCountryCode = formatPhoneWithCountryCode(
    patient.phone,
    clinic.country_code || 'IN'
  );

  await generateAndStorePaymentDocuments(paymentId);

  const { data: documents, error: documentsError } = await supabase
    .from("documents")
    .select("id, document_type")
    .eq("payment_id", paymentId)
    .eq("clinic_id", payment.clinic_id);

  if (documentsError || !documents || documents.length === 0) {
    return { success: false, error: "Could not generate or find receipt/treatment documents for this payment" };
  }

  const typedDocuments = documents as { id: string; document_type: string }[];
  const receiptDoc = typedDocuments.find((d) => d.document_type === "receipt");
  const treatmentDoc = typedDocuments.find((d) => d.document_type === "treatment_details");

  if (!receiptDoc || !treatmentDoc) {
    return { success: false, error: "Receipt or treatment document is missing — cannot send confirmation message" };
  }

  const receiptToken = await getOrCreateActivePublicLink(supabase, receiptDoc.id, payment.clinic_id, profile.id);
  const treatmentToken = await getOrCreateActivePublicLink(supabase, treatmentDoc.id, payment.clinic_id, profile.id);

  if (!receiptToken || !treatmentToken) {
    return { success: false, error: "Failed to create public download links for the documents" };
  }

  const placeholders: ReceiptPlaceholders = {
    PATIENT_NAME: `${patient.first_name} ${patient.last_name}`,
    CLINIC_NAME: clinic.name,
    RECEIPT_LINK: buildPublicDocumentUrl(receiptToken),
    TREATMENT_PDF_LINK: buildPublicDocumentUrl(treatmentToken),
  };

  // See the comment on the equivalent insert in createRegistrationMessage —
  // generating the id client-side avoids a post-insert re-select subject
  // to message_queue_doctor_scoped_select RLS.
  const receiptMessageId = crypto.randomUUID();

  const { error: insertError } = await supabase
    .from("message_queue")
    .insert({
      id: receiptMessageId,
      clinic_id: payment.clinic_id,
      patient_id: patient.id,
      payment_id: payment.id,
      type: "receipt",
      language: patient.language_preference,
      phone: phoneWithCountryCode,
      placeholders,
      status: "pending",
      scheduled_send_time: new Date().toISOString(),
      created_by: profile.id,
    });

  if (insertError) {
    return { success: false, error: insertError.message ?? "Failed to queue receipt message" };
  }

  await supabase.from("message_delivery_logs").insert({
    clinic_id: payment.clinic_id,
    message_queue_id: receiptMessageId,
    action: "created",
    performed_by: profile.id,
  });

  revalidatePath("/dashboard/messages");
  return { success: true, messageId: receiptMessageId };
}

// ============================================================================
// regeneratePaymentDocumentLinks
// ============================================================================
export async function regeneratePaymentDocumentLinks(input: CreateReceiptMessageInput) {
  const profile = await requireRole("doctor", "staff");
  const { paymentId } = createReceiptMessageInputSchema.parse(input);
  const supabase = createServerSupabaseClient();

  const { data: documents, error: documentsError } = await supabase
    .from("documents")
    .select("id, document_type")
    .eq("payment_id", paymentId)
    .eq("clinic_id", profile.clinic_id);

  if (documentsError || !documents || documents.length === 0) {
    return { success: false, error: "No documents found for this payment" };
  }

  const typedDocuments = documents as { id: string; document_type: string }[];
  const links: Record<string, string> = {};

  for (const doc of typedDocuments) {
    if (!profile.clinic_id) return { success: false, error: 'Clinic not found on profile.' }
const token = await regenerateDocumentLink(supabase, doc.id, profile.clinic_id, profile.id);
    if (token) {
      links[doc.document_type] = buildPublicDocumentUrl(token);
    }
  }

  if (Object.keys(links).length === 0) {
    return { success: false, error: "Failed to regenerate any links" };
  }

  return { success: true, links };
}

// ============================================================================
// sendMessage
// ============================================================================
export async function sendMessage(input: SendMessageInput) {
  const profile = await requireRole("doctor", "staff");
  const { messageId } = sendMessageInputSchema.parse(input);
  const supabase = createServerSupabaseClient();

  const { data: message, error: fetchError } = await supabase
    .from("message_queue")
    .select("*")
    .eq("id", messageId)
    .single();

  if (fetchError || !message) {
    return { success: false, error: "Message not found" };
  }

  // Ownership check (defence in depth alongside message_queue_doctor_scoped_*
  // RLS policies) — a doctor must only be able to send messages tied to a
  // record they're the doctor on (appointment/payment), or a registration
  // message for a patient assigned to them. Even if called directly with
  // a known id, this independently re-verifies rather than trusting RLS
  // alone for a mutating action.
  const visible = await isMessageVisibleToDoctor(supabase, profile, message);
  if (!visible) {
    console.error("[sendMessage] doctor attempted to send a message they are not the doctor on");
    return { success: false, error: "Message not found" };
  }

  if (message.status !== "pending") {
    return { success: false, error: `Message is already ${message.status}, cannot send again` };
  }

  const { data: template, error: templateError } = await supabase
    .from("message_templates")
    .select("content")
    .eq("type", message.type)
    .eq("language", message.language)
    .single();

  if (templateError || !template) {
    return { success: false, error: "Template not found for this message type/language" };
  }

  const placeholders = messagePlaceholdersSchema.parse(message.placeholders);
  const provider = getMessageProvider();
  const bodyParams = buildBodyParams(template.content, placeholders);
  const templateName = getProviderTemplateName(message.type, message.language);

  const result = await provider.sendTemplateMessage({
    phone: message.phone,
    templateName,
    languageCode: message.language,
    bodyParams,
  });

  if (result.success) {
    await supabase
      .from("message_queue")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        provider: provider.name,
        provider_message_id: result.providerMessageId ?? null,
      })
      .eq("id", messageId);

    await supabase.from("message_delivery_logs").insert({
      clinic_id: message.clinic_id,
      message_queue_id: messageId,
      action: "sent",
      performed_by: profile.id,
      provider: provider.name,
      details: { providerMessageId: result.providerMessageId ?? null },
    });

    revalidatePath("/dashboard/messages");
    return { success: true };
  }

  await supabase
    .from("message_queue")
    .update({
      status: "failed",
      provider: provider.name,
      error_message: result.errorMessage ?? "Unknown send failure",
    })
    .eq("id", messageId);

  await supabase.from("message_delivery_logs").insert({
    clinic_id: message.clinic_id,
    message_queue_id: messageId,
    action: "failed",
    performed_by: profile.id,
    provider: provider.name,
    details: { errorMessage: result.errorMessage ?? null },
  });

  return { success: false, error: result.errorMessage ?? "Failed to send message" };
}

// ============================================================================
// sendAllMessages
// ============================================================================
export async function sendAllMessages(input: SendAllMessagesInput) {
  await requireRole("doctor", "staff");
  const { messageIds } = sendAllMessagesInputSchema.parse(input);

  let succeeded = 0;
  let failed = 0;
  const errors: { messageId: string; error: string }[] = [];

  for (const messageId of messageIds) {
    // sendMessage independently re-checks permission per id (see ownership
    // check inside it) — this loop does NOT trust that the caller's list
    // was already filtered to permitted messages. A doctor's client could
    // in principle submit ids for messages outside their scope; each one
    // is rejected individually here rather than assumed valid.
    const result = await sendMessage({ messageId });
    if (result.success) {
      succeeded++;
    } else {
      failed++;
      errors.push({ messageId, error: result.error ?? "Unknown error" });
    }
  }

  revalidatePath("/dashboard/messages");
  return { succeeded, failed, errors };
}

// ============================================================================
// cancelMessage
// ============================================================================
export async function cancelMessage(input: CancelMessageInput) {
  const profile = await requireRole("doctor", "staff");
  const { messageId } = cancelMessageInputSchema.parse(input);
  const supabase = createServerSupabaseClient();

  const { data: message, error: fetchError } = await supabase
    .from("message_queue")
    .select("id, clinic_id, patient_id, appointment_id, payment_id, type, status")
    .eq("id", messageId)
    .single();

  if (fetchError || !message) {
    return { success: false, error: "Message not found" };
  }

  // Ownership check (defence in depth alongside message_queue_doctor_scoped_*
  // RLS policies) — same rule as sendMessage above.
  const visible = await isMessageVisibleToDoctor(supabase, profile, message);
  if (!visible) {
    console.error("[cancelMessage] doctor attempted to cancel a message they are not the doctor on");
    return { success: false, error: "Message not found" };
  }

  if (message.status !== "pending") {
    return { success: false, error: `Cannot cancel a message that is already ${message.status}` };
  }

  const { error: updateError } = await supabase
    .from("message_queue")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancelled_by: profile.id,
    })
    .eq("id", messageId);

  if (updateError) {
    return { success: false, error: updateError.message };
  }

  await supabase.from("message_delivery_logs").insert({
    clinic_id: message.clinic_id,
    message_queue_id: messageId,
    action: "cancelled",
    performed_by: profile.id,
  });

  revalidatePath("/dashboard/messages");
  return { success: true };
}

// ============================================================================
// getClinicMessageUsage
// ============================================================================
export async function getClinicMessageUsage(): Promise<{
  messages_sent: number;
  included_limit: number;
  overage_rate_paise: number;
  overage_count: number;
  overage_amount_paise: number;
  is_settled: boolean;
}> {
  await requireRole("doctor", "staff");
  const supabase = createServerSupabaseClient();

  const billingMonth = new Date();
  billingMonth.setUTCDate(1);
  billingMonth.setUTCHours(0, 0, 0, 0);
  const billingMonthStr = billingMonth.toISOString().slice(0, 10);

  const { data: usage } = await supabase
    .from("clinic_message_usage")
    .select("*")
    .eq("billing_month", billingMonthStr)
    .maybeSingle();

  if (usage) {
    return usage as {
      messages_sent: number;
      included_limit: number;
      overage_rate_paise: number;
      overage_count: number;
      overage_amount_paise: number;
      is_settled: boolean;
    };
  }

  // No usage row exists yet for this clinic this month (no message has
  // been sent yet, so the trg_increment_message_usage trigger hasn't
  // fired). Fall back to the same INCLUDED_MESSAGE_LIMIT /
  // OVERAGE_RATE_PAISE constants the DB column defaults were set to in
  // Item 8's migration — kept in one place (src/lib/config/messaging.ts)
  // so this fallback can never drift from what a real row would get.
  return {
    messages_sent: 0,
    included_limit: INCLUDED_MESSAGE_LIMIT,
    overage_rate_paise: OVERAGE_RATE_PAISE,
    overage_count: 0,
    overage_amount_paise: 0,
    is_settled: false,
  };
}

// ============================================================================
// expireOverdueAppointmentMessages
//
// Deliberately clinic-wide, NOT doctor-scoped. This is a housekeeping
// side-effect (marking stale pending appointment messages as expired), not
// a read or send action — restricting it by doctor could leave a doctor's
// own stale messages un-expired if a staff member (whose queue view is
// clinic-wide) happens to load the page first and runs this before that
// doctor ever does. Confirmed with product owner (Issue 3 audit).
// ============================================================================
export async function expireOverdueAppointmentMessages() {
  await requireRole("doctor", "staff");
  const supabase = createServerSupabaseClient();

  const { data: expired, error } = await supabase
    .from("message_queue")
    .update({ status: "expired" })
    .eq("status", "pending")
    .eq("type", "appointment")
    .lt("expires_at", new Date().toISOString())
    .select("id, clinic_id");

  if (error) {
    return { success: false, error: error.message, expiredCount: 0 };
  }

  if (expired && expired.length > 0) {
    await supabase.from("message_delivery_logs").insert(
      expired.map((row: { id: string; clinic_id: string }) => ({
        clinic_id: row.clinic_id,
        message_queue_id: row.id,
        action: "expired" as const,
      }))
    );
  }

  return { success: true, expiredCount: expired?.length ?? 0 };
}

// ============================================================================
// suppressAppointmentMessages (Issue 4)
//
// Called when an appointment transitions to completed or cancelled.
// Wraps the suppress_appointment_messages() SECURITY DEFINER RPC — that
// function does its own clinic-id check but deliberately does NOT check
// that the calling doctor owns the appointment, since the callers
// (cancelAppointment / updateAppointmentStatus in appointments/actions.ts)
// don't currently enforce that ownership check either. Using a RESTRICTIVE-
// RLS-bound update here would silently no-op for a doctor completing
// another doctor's appointment, defeating the fix for exactly the
// cross-doctor case Issues 2/3 exist to handle correctly.
//
// Marks (not deletes) pending 'appointment' type messages as cancelled —
// registration/receipt/medicine_receipt messages never carry
// appointment_id, so they're excluded by construction, not by an
// additional type filter that could be gotten wrong.
// ============================================================================
export async function suppressAppointmentMessages(
  appointmentId: string
): Promise<{ success: true; suppressedCount: number } | { success: false; error: string }> {
  const profile = await requireRole("doctor", "staff");
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase.rpc("suppress_appointment_messages", {
    p_appointment_id: appointmentId,
    p_actor_id: profile.id,
  });

  if (error) {
    console.error("[suppressAppointmentMessages]", error);
    return { success: false, error: error.message };
  }

  const suppressedCount = (data as number) ?? 0;
  if (suppressedCount > 0) {
    revalidatePath("/dashboard/messages");
  }

  return { success: true, suppressedCount };
}

// ============================================================================
// getMessageClusters
// ============================================================================
export async function getMessageClusters(): Promise<{
  ready: ReadyMessage[];
  scheduled: ScheduledReminder[];
  archive: ArchiveMessage[];
}> {
  const profile = await requireRole("doctor", "staff");
  const supabase = createServerSupabaseClient();

  // Expire overdue appointment messages first (clinic-wide — see comment
  // on expireOverdueAppointmentMessages above)
  await expireOverdueAppointmentMessages();

  // Doctor-scoping is enforced by the message_queue_doctor_scoped_select
  // RESTRICTIVE RLS policy, which implements the exact same type-conditional
  // logic as isMessageVisibleToDoctor above (appointment/payment/patient
  // ownership per message type). Deliberately NOT duplicated here as a
  // parallel JS filter — for a single table with type-dependent visibility,
  // re-deriving three different per-type id lists client-side is both more
  // code and a real risk of silently drifting out of sync with the policy.
  // clinic_id scoping below is still explicit (defence in depth for the
  // clinic boundary specifically, same as every other query in this file).

  // Fetch all three clusters in parallel
  const [readyData, scheduledData, archiveData] = await Promise.all([
    // Ready to Send: ALL pending messages (registration, receipt, appointment, medicine_receipt)
    supabase
      .from("message_queue")
      .select("*, appointments(status)")
      .eq("clinic_id", profile.clinic_id)
      .eq("status", "pending")
      .order("created_at", { ascending: true }),
    // Scheduled Reminders: upcoming appointment reminders (scheduled_send_time in future)
    supabase
      .from("message_queue")
      .select("*, appointments(status)")
      .eq("clinic_id", profile.clinic_id)
      .eq("status", "pending")
      .eq("type", "appointment")
      .gte("scheduled_send_time", new Date().toISOString())
      .order("scheduled_send_time", { ascending: true }),
    // Archive: sent, failed, cancelled, expired messages
    supabase
      .from("message_queue")
      .select("*")
      .eq("clinic_id", profile.clinic_id)
      .in("status", ["sent", "failed", "cancelled", "expired"])
      .order("created_at", { ascending: false }),
  ]);

  // Defensive filter (Issue 4): excludes appointment-type messages whose
  // linked appointment is already completed/cancelled. Primarily a safety
  // net for rows created BEFORE this fix shipped — suppressAppointmentMessages
  // now marks these cancelled going forward at the moment of completion, so
  // this filter should rarely have anything to catch on new data, but
  // covers any pre-existing stale rows or a suppression call that failed
  // silently. Only applies to type === 'appointment'; other message types
  // have no linked appointment and pass through unaffected.
  function isStaleAppointmentMessage(msg: any): boolean {
    if (msg.type !== "appointment") return false;
    const linkedStatus = msg.appointments?.status;
    return linkedStatus === "completed" || linkedStatus === "cancelled";
  }

  const ready: ReadyMessage[] = (readyData.data || [])
    .filter((msg: any) => !isStaleAppointmentMessage(msg))
    .map((msg: any) => ({
      id: msg.id,
      patientName: msg.placeholders?.PATIENT_NAME || "Unknown",
      phone: msg.phone,
      type: msg.type,
      language: msg.language,
      status: msg.status,
      createdAt: msg.created_at,
    }));

  const scheduled: ScheduledReminder[] = (scheduledData.data || [])
    .filter((msg: any) => !isStaleAppointmentMessage(msg))
    .map((msg: any) => ({
      id: msg.id,
      patientName: msg.placeholders?.PATIENT_NAME || "Unknown",
      doctorName: msg.placeholders?.DOCTOR_NAME || "your doctor",
      appointmentDate: msg.placeholders?.APPOINTMENT_DATE || "Unknown",
      appointmentTime: msg.placeholders?.APPOINTMENT_TIME || "Unknown",
      scheduledSendTime: msg.scheduled_send_time,
      status: msg.status,
    }));

  const archive: ArchiveMessage[] = (archiveData.data || []).map((msg: any) => ({
    id: msg.id,
    patientName: msg.placeholders?.PATIENT_NAME || "Unknown",
    messageType: msg.type,
    status: msg.status as "sent" | "failed" | "cancelled" | "expired",
    timestamp: msg.sent_at || msg.created_at,
    failureReason: msg.error_message,
  }));

  return {
    ready,
    scheduled,
    archive,
  };
}

// ============================================================================
// createMedicineReceiptMessage
//
// Mirrors createReceiptMessage above, but for medicine payments specifically.
// createReceiptMessage hard-requires BOTH a 'receipt' and a
// 'treatment_details' document — a medicine payment will only ever produce
// a single 'medicine_receipt' document, so that function can never succeed
// for a medicine payment. This is the parallel path with only one required
// document and one placeholder (RECEIPT_LINK; no TREATMENT_PDF_LINK).
//
// generateAndStoreMedicineReceipt is imported lazily inside the function
// body (not at module top) to avoid a module-load-time dependency from the
// messaging feature on the pharmacy feature — only pulled in when a
// medicine receipt message is actually being created.
// ============================================================================
export async function createMedicineReceiptMessage(input: CreateReceiptMessageInput) {
  const profile = await requireRole("doctor", "staff");
  const { paymentId } = createReceiptMessageInputSchema.parse(input);
  const supabase = createServerSupabaseClient();

  const { data: existingMessage } = await supabase
    .from("message_queue")
    .select("id")
    .eq("payment_id", paymentId)
    .eq("type", "medicine_receipt")
    .in("status", ["pending", "sent"])
    .maybeSingle();

  if (existingMessage) {
    return { success: true, messageId: existingMessage.id, alreadyExisted: true };
  }

  const { data: payment, error: paymentError } = await supabase
    .from("payments")
    .select("id, clinic_id, patient_id, approval_status, payment_source")
    .eq("id", paymentId)
    .single();

  if (paymentError || !payment) {
    return { success: false, error: "Payment not found" };
  }

  if (payment.payment_source !== "medicine") {
    return { success: false, error: "This is not a medicine payment" };
  }

  if (payment.approval_status !== "approved") {
    return { success: false, error: "Cannot send receipt message — payment has not been approved yet" };
  }

  const { data: patient, error: patientError } = await supabase
    .from("patients")
    .select("id, first_name, last_name, phone, language_preference")
    .eq("id", payment.patient_id)
    .single();

  if (patientError || !patient) {
    return { success: false, error: "Patient not found" };
  }

  if (!patient.phone) {
    return { success: false, error: "Patient has no phone number on file" };
  }

  const { data: clinic, error: clinicError } = await supabase
    .from("clinics")
    .select("id, name, country_code")
    .eq("id", payment.clinic_id)
    .single();

  if (clinicError || !clinic) {
    return { success: false, error: "Clinic not found" };
  }

  const phoneWithCountryCode = formatPhoneWithCountryCode(
    patient.phone,
    clinic.country_code || 'IN'
  );

  const { generateAndStoreMedicineReceipt } = await import("@/features/pharmacy/document-storage");
  const receiptDoc = await generateAndStoreMedicineReceipt(paymentId);

  if (!receiptDoc) {
    return { success: false, error: "Could not generate or find the medicine receipt document" };
  }

  const receiptToken = await getOrCreateActivePublicLink(supabase, receiptDoc.id, payment.clinic_id, profile.id);

  if (!receiptToken) {
    return { success: false, error: "Failed to create a public download link for the receipt" };
  }

  const placeholders: Record<string, string> = {
    PATIENT_NAME: `${patient.first_name} ${patient.last_name}`,
    CLINIC_NAME: clinic.name,
    RECEIPT_LINK: buildPublicDocumentUrl(receiptToken),
  };

  // See the comment on the equivalent insert in createRegistrationMessage —
  // generating the id client-side avoids a post-insert re-select subject
  // to message_queue_doctor_scoped_select RLS.
  const medicineReceiptMessageId = crypto.randomUUID();

  const { error: insertError } = await supabase
    .from("message_queue")
    .insert({
      id: medicineReceiptMessageId,
      clinic_id: payment.clinic_id,
      patient_id: patient.id,
      payment_id: payment.id,
      type: "medicine_receipt",
      language: patient.language_preference,
      phone: phoneWithCountryCode,
      placeholders,
      status: "pending",
      scheduled_send_time: new Date().toISOString(),
      created_by: profile.id,
    });

  if (insertError) {
    return { success: false, error: insertError.message ?? "Failed to queue medicine receipt message" };
  }

  await supabase.from("message_delivery_logs").insert({
    clinic_id: payment.clinic_id,
    message_queue_id: medicineReceiptMessageId,
    action: "created",
    performed_by: profile.id,
  });

  revalidatePath("/dashboard/messages");
  return { success: true, messageId: medicineReceiptMessageId };
}