"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/supabase/profile";
import { generateAndStorePaymentDocuments } from "@/features/payments/document-storage";
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

export type ReadyMessage = {
  id: string; patientName: string; phone: string;
  type: "registration" | "receipt"; language: string; status: string; createdAt: string;
};

export type ScheduledReminder = {
  id: string; patientName: string; doctorName: string;
  appointmentDate: string; appointmentTime: string; scheduledSendTime: string; status: string;
};

export type ArchiveMessage = {
  id: string; patientName: string; messageType: string;
  status: "sent" | "failed" | "cancelled" | "expired"; timestamp: string; failureReason: string | null;
};

const COUNTRY_CODE_MAP: Record<string, string> = {
  'IN': '91', 'US': '1', 'GB': '44', 'AE': '971', 'SA': '966', 'AU': '61', 'NZ': '64',
};

function formatPhoneWithCountryCode(phone: string, countryCode: string): string {
  const code = COUNTRY_CODE_MAP[countryCode] || '91';
  return phone.startsWith(code) ? phone : `${code}${phone}`;
}

export async function createRegistrationMessage(input: CreateRegistrationMessageInput) {
  const profile = await requireRole("doctor", "staff");
  const { patientId } = createRegistrationMessageInputSchema.parse(input);
  const supabase = createServerSupabaseClient();

  const { data: existingMessage } = await supabase
    .from("message_queue").select("id")
    .eq("patient_id", patientId).eq("type", "registration").in("status", ["pending", "sent"]).maybeSingle();

  if (existingMessage) return { success: true, messageId: existingMessage.id, alreadyExisted: true };

  const { data: patient, error: patientError } = await supabase
    .from("patients").select("id, clinic_id, first_name, last_name, email, phone, language_preference")
    .eq("id", patientId).single();

  if (patientError || !patient) return { success: false, error: "Patient not found" };
  if (!patient.phone) return { success: false, error: "Patient has no phone number on file" };
  if (!patient.email) return { success: false, error: "Patient has no email on file" };

  const { data: clinic, error: clinicError } = await supabase
    .from("clinics").select("id, name, country_code").eq("id", patient.clinic_id).single();

  if (clinicError || !clinic) return { success: false, error: "Clinic not found" };

  const phoneWithCountryCode = formatPhoneWithCountryCode(patient.phone, clinic.country_code || 'IN');
  const placeholders: RegistrationPlaceholders = {
    CLINIC_NAME: clinic.name, PATIENT_NAME: `${patient.first_name} ${patient.last_name}`,
    EMAIL: patient.email, LOGIN_LINK: `${process.env.NEXT_PUBLIC_APP_URL}/patient/login`,
  };

  const { data: inserted, error: insertError } = await supabase
    .from("message_queue").insert({
      clinic_id: patient.clinic_id, patient_id: patient.id, type: "registration",
      language: patient.language_preference, phone: phoneWithCountryCode, placeholders,
      status: "pending", scheduled_send_time: new Date().toISOString(), created_by: profile.id,
    }).select("id").single();

  if (insertError || !inserted) return { success: false, error: insertError?.message ?? "Failed to queue registration message" };

  await supabase.from("message_delivery_logs").insert({ clinic_id: patient.clinic_id, message_queue_id: inserted.id, action: "created", performed_by: profile.id });
  revalidatePath("/dashboard/messages");
  return { success: true, messageId: inserted.id };
}

export async function createAppointmentMessage(input: CreateAppointmentMessageInput) {
  const profile = await requireRole("doctor", "staff");
  const { appointmentId } = createAppointmentMessageInputSchema.parse(input);
  const supabase = createServerSupabaseClient();

  const { data: appointment, error: appointmentError } = await supabase
    .from("appointments").select("id, clinic_id, patient_id, doctor_id, appointment_date, status")
    .eq("id", appointmentId).single();

  if (appointmentError || !appointment) return { success: false, error: "Appointment not found" };
  if (appointment.status !== "scheduled") return { success: false, error: `Cannot queue a reminder for a ${appointment.status} appointment` };

  const { data: existing } = await supabase.from("message_queue").select("id").eq("appointment_id", appointmentId).eq("status", "pending").maybeSingle();
  if (existing) return { success: true, messageId: existing.id, alreadyExisted: true };

  const { data: patient, error: patientError } = await supabase.from("patients").select("id, first_name, last_name, phone, language_preference").eq("id", appointment.patient_id).single();
  if (patientError || !patient) return { success: false, error: "Patient not found" };
  if (!patient.phone) return { success: false, error: "Patient has no phone number on file" };

  const { data: clinic, error: clinicError } = await supabase.from("clinics").select("id, name, phone, timezone, country_code").eq("id", appointment.clinic_id).single();
  if (clinicError || !clinic) return { success: false, error: "Clinic not found" };

  const phoneWithCountryCode = formatPhoneWithCountryCode(patient.phone, clinic.country_code || 'IN');
  const { data: doctorProfile } = await supabase.from("profiles").select("full_name").eq("id", appointment.doctor_id).maybeSingle();

  const appointmentDate = new Date(appointment.appointment_date);
  const timeZone = clinic.timezone || "Asia/Kolkata";
  const formattedDate = appointmentDate.toLocaleDateString("en-IN", { timeZone, day: "numeric", month: "long", year: "numeric" });
  const formattedTime = appointmentDate.toLocaleTimeString("en-IN", { timeZone, hour: "numeric", minute: "2-digit", hour12: true });

  const placeholders: AppointmentPlaceholders = {
    PATIENT_NAME: `${patient.first_name} ${patient.last_name}`,
    DOCTOR_NAME: doctorProfile?.full_name ?? "your doctor",
    CLINIC_NAME: clinic.name, APPOINTMENT_DATE: formattedDate, APPOINTMENT_TIME: formattedTime,
    DASHBOARD_LINK: `${process.env.NEXT_PUBLIC_APP_URL}/patient/dashboard/messages`,
    CLINIC_PHONE: clinic.phone ?? "the clinic",
  };

  const computed = getLocalTimeAsUtc(appointmentDate, timeZone, 4, 30);
  const scheduledSendTime = computed < new Date() ? new Date() : computed;

  const { data: inserted, error: insertError } = await supabase.from("message_queue").insert({
    clinic_id: appointment.clinic_id, patient_id: patient.id, appointment_id: appointment.id,
    type: "appointment", language: patient.language_preference, phone: phoneWithCountryCode,
    placeholders, status: "pending", scheduled_send_time: scheduledSendTime.toISOString(),
    expires_at: appointment.appointment_date, created_by: profile.id,
  }).select("id").single();

  if (insertError || !inserted) return { success: false, error: insertError?.message ?? "Failed to queue appointment message" };

  await supabase.from("message_delivery_logs").insert({ clinic_id: appointment.clinic_id, message_queue_id: inserted.id, action: "created", performed_by: profile.id });
  revalidatePath("/dashboard/messages");
  return { success: true, messageId: inserted.id };
}

export async function createReceiptMessage(input: CreateReceiptMessageInput) {
  const profile = await requireRole("doctor", "staff");
  const { paymentId } = createReceiptMessageInputSchema.parse(input);
  const supabase = createServerSupabaseClient();

  const { data: existingMessage } = await supabase.from("message_queue").select("id").eq("payment_id", paymentId).eq("type", "receipt").in("status", ["pending", "sent"]).maybeSingle();
  if (existingMessage) return { success: true, messageId: existingMessage.id, alreadyExisted: true };

  const { data: payment, error: paymentError } = await supabase.from("payments").select("id, clinic_id, patient_id, approval_status").eq("id", paymentId).single();
  if (paymentError || !payment) return { success: false, error: "Payment not found" };
  if (payment.approval_status !== "approved") return { success: false, error: "Cannot send receipt message - payment has not been approved yet" };

  const { data: patient, error: patientError } = await supabase.from("patients").select("id, first_name, last_name, phone, language_preference").eq("id", payment.patient_id).single();
  if (patientError || !patient) return { success: false, error: "Patient not found" };
  if (!patient.phone) return { success: false, error: "Patient has no phone number on file" };

  const { data: clinic, error: clinicError } = await supabase.from("clinics").select("id, name, country_code").eq("id", payment.clinic_id).single();
  if (clinicError || !clinic) return { success: false, error: "Clinic not found" };

  const phoneWithCountryCode = formatPhoneWithCountryCode(patient.phone, clinic.country_code || 'IN');
  await generateAndStorePaymentDocuments(paymentId);

  const { data: documents, error: documentsError } = await supabase.from("documents").select("id, document_type").eq("payment_id", paymentId).eq("clinic_id", payment.clinic_id);
  if (documentsError || !documents || documents.length === 0) return { success: false, error: "Could not generate or find receipt/treatment documents for this payment" };

  const typedDocuments = documents as { id: string; document_type: string }[];
  const receiptDoc = typedDocuments.find((d) => d.document_type === "receipt");
  const treatmentDoc = typedDocuments.find((d) => d.document_type === "treatment_details");
  if (!receiptDoc || !treatmentDoc) return { success: false, error: "Receipt or treatment document is missing - cannot send confirmation message" };

  const receiptToken = await getOrCreateActivePublicLink(supabase, receiptDoc.id, payment.clinic_id, profile.id);
  const treatmentToken = await getOrCreateActivePublicLink(supabase, treatmentDoc.id, payment.clinic_id, profile.id);
  if (!receiptToken || !treatmentToken) return { success: false, error: "Failed to create public download links for the documents" };

  const placeholders: ReceiptPlaceholders = {
    PATIENT_NAME: `${patient.first_name} ${patient.last_name}`, CLINIC_NAME: clinic.name,
    RECEIPT_LINK: buildPublicDocumentUrl(receiptToken), TREATMENT_PDF_LINK: buildPublicDocumentUrl(treatmentToken),
  };

  const { data: inserted, error: insertError } = await supabase.from("message_queue").insert({
    clinic_id: payment.clinic_id, patient_id: patient.id, payment_id: payment.id,
    type: "receipt", language: patient.language_preference, phone: phoneWithCountryCode,
    placeholders, status: "pending", scheduled_send_time: new Date().toISOString(), created_by: profile.id,
  }).select("id").single();

  if (insertError || !inserted) return { success: false, error: insertError?.message ?? "Failed to queue receipt message" };

  await supabase.from("message_delivery_logs").insert({ clinic_id: payment.clinic_id, message_queue_id: inserted.id, action: "created", performed_by: profile.id });
  revalidatePath("/dashboard/messages");
  return { success: true, messageId: inserted.id };
}

// ── regeneratePaymentDocumentLinks ──────────────────────────────────────────
// FIX (this chat): clinic_id is nullable on Profile now. requireRole ensures
// role is 'doctor' or 'staff', both of which always get a clinic_id from
// onboarding, but the type system cannot prove that. This guard makes the
// null case explicit rather than silently passing it into regenerateDocumentLink's
// strict string parameter (the source of the original compile error at line 453).
export async function regeneratePaymentDocumentLinks(input: CreateReceiptMessageInput) {
  const profile = await requireRole("doctor", "staff");
  const { paymentId } = createReceiptMessageInputSchema.parse(input);

  if (!profile.clinic_id) {
    return { success: false, error: 'Your account is not associated with a clinic.' }
  }
  const clinicId = profile.clinic_id

  const supabase = createServerSupabaseClient();

  const { data: documents, error: documentsError } = await supabase
    .from("documents").select("id, document_type")
    .eq("payment_id", paymentId).eq("clinic_id", clinicId);

  if (documentsError || !documents || documents.length === 0) {
    return { success: false, error: "No documents found for this payment" };
  }

  const typedDocuments = documents as { id: string; document_type: string }[];
  const links: Record<string, string> = {};

  for (const doc of typedDocuments) {
    const token = await regenerateDocumentLink(supabase, doc.id, clinicId, profile.id);
    if (token) links[doc.document_type] = buildPublicDocumentUrl(token);
  }

  if (Object.keys(links).length === 0) return { success: false, error: "Failed to regenerate any links" };
  return { success: true, links };
}

export async function sendMessage(input: SendMessageInput) {
  const profile = await requireRole("doctor", "staff");
  const { messageId } = sendMessageInputSchema.parse(input);
  const supabase = createServerSupabaseClient();

  const { data: message, error: fetchError } = await supabase.from("message_queue").select("*").eq("id", messageId).single();
  if (fetchError || !message) return { success: false, error: "Message not found" };
  if (message.status !== "pending") return { success: false, error: `Message is already ${message.status}, cannot send again` };

  const { data: template, error: templateError } = await supabase.from("message_templates").select("content").eq("type", message.type).eq("language", message.language).single();
  if (templateError || !template) return { success: false, error: "Template not found for this message type/language" };

  const placeholders = messagePlaceholdersSchema.parse(message.placeholders);
  const provider = getMessageProvider();
  const bodyParams = buildBodyParams(template.content, placeholders);
  const templateName = getProviderTemplateName(message.type, message.language);

  const result = await provider.sendTemplateMessage({ phone: message.phone, templateName, languageCode: message.language, bodyParams });

  if (result.success) {
    await supabase.from("message_queue").update({ status: "sent", sent_at: new Date().toISOString(), provider: provider.name, provider_message_id: result.providerMessageId ?? null }).eq("id", messageId);
    await supabase.from("message_delivery_logs").insert({ clinic_id: message.clinic_id, message_queue_id: messageId, action: "sent", performed_by: profile.id, provider: provider.name, details: { providerMessageId: result.providerMessageId ?? null } });
    revalidatePath("/dashboard/messages");
    return { success: true };
  }

  await supabase.from("message_queue").update({ status: "failed", provider: provider.name, error_message: result.errorMessage ?? "Unknown send failure" }).eq("id", messageId);
  await supabase.from("message_delivery_logs").insert({ clinic_id: message.clinic_id, message_queue_id: messageId, action: "failed", performed_by: profile.id, provider: provider.name, details: { errorMessage: result.errorMessage ?? null } });
  return { success: false, error: result.errorMessage ?? "Failed to send message" };
}

export async function sendAllMessages(input: SendAllMessagesInput) {
  await requireRole("doctor", "staff");
  const { messageIds } = sendAllMessagesInputSchema.parse(input);
  let succeeded = 0; let failed = 0;
  const errors: { messageId: string; error: string }[] = [];
  for (const messageId of messageIds) {
    const result = await sendMessage({ messageId });
    if (result.success) { succeeded++ } else { failed++; errors.push({ messageId, error: result.error ?? "Unknown error" }) }
  }
  revalidatePath("/dashboard/messages");
  return { succeeded, failed, errors };
}

export async function cancelMessage(input: CancelMessageInput) {
  const profile = await requireRole("doctor", "staff");
  const { messageId } = cancelMessageInputSchema.parse(input);
  const supabase = createServerSupabaseClient();

  const { data: message, error: fetchError } = await supabase.from("message_queue").select("id, clinic_id, status").eq("id", messageId).single();
  if (fetchError || !message) return { success: false, error: "Message not found" };
  if (message.status !== "pending") return { success: false, error: `Cannot cancel a message that is already ${message.status}` };

  const { error: updateError } = await supabase.from("message_queue").update({ status: "cancelled", cancelled_at: new Date().toISOString(), cancelled_by: profile.id }).eq("id", messageId);
  if (updateError) return { success: false, error: updateError.message };

  await supabase.from("message_delivery_logs").insert({ clinic_id: message.clinic_id, message_queue_id: messageId, action: "cancelled", performed_by: profile.id });
  revalidatePath("/dashboard/messages");
  return { success: true };
}

export async function getClinicMessageUsage(): Promise<{
  messages_sent: number; included_limit: number; overage_rate_paise: number;
  overage_count: number; overage_amount_paise: number; is_settled: boolean;
}> {
  await requireRole("doctor", "staff");
  const supabase = createServerSupabaseClient();
  const billingMonth = new Date();
  billingMonth.setUTCDate(1); billingMonth.setUTCHours(0, 0, 0, 0);
  const billingMonthStr = billingMonth.toISOString().slice(0, 10);
  const { data: usage } = await supabase.from("clinic_message_usage").select("*").eq("billing_month", billingMonthStr).maybeSingle();
  if (usage) return usage as { messages_sent: number; included_limit: number; overage_rate_paise: number; overage_count: number; overage_amount_paise: number; is_settled: boolean };
  return { messages_sent: 0, included_limit: 250, overage_rate_paise: 150, overage_count: 0, overage_amount_paise: 0, is_settled: false };
}

export async function expireOverdueAppointmentMessages() {
  await requireRole("doctor", "staff");
  const supabase = createServerSupabaseClient();
  const { data: expired, error } = await supabase.from("message_queue").update({ status: "expired" }).eq("status", "pending").eq("type", "appointment").lt("expires_at", new Date().toISOString()).select("id, clinic_id");
  if (error) return { success: false, error: error.message, expiredCount: 0 };
  if (expired && expired.length > 0) {
    await supabase.from("message_delivery_logs").insert(expired.map((row: { id: string; clinic_id: string }) => ({ clinic_id: row.clinic_id, message_queue_id: row.id, action: "expired" as const })));
  }
  return { success: true, expiredCount: expired?.length ?? 0 };
}

export async function getMessageClusters(): Promise<{ ready: ReadyMessage[]; scheduled: ScheduledReminder[]; archive: ArchiveMessage[] }> {
  await requireRole("doctor", "staff");
  const supabase = createServerSupabaseClient();
  const profile = await requireRole("doctor", "staff");
  await expireOverdueAppointmentMessages();

  const [readyData, scheduledData, archiveData] = await Promise.all([
    supabase.from("message_queue").select("*").eq("clinic_id", profile.clinic_id).eq("status", "pending").neq("type", "appointment").order("created_at", { ascending: true }),
    supabase.from("message_queue").select("*").eq("clinic_id", profile.clinic_id).eq("status", "pending").eq("type", "appointment").gte("scheduled_send_time", new Date().toISOString()).order("scheduled_send_time", { ascending: true }),
    supabase.from("message_queue").select("*").eq("clinic_id", profile.clinic_id).in("status", ["sent", "failed", "cancelled", "expired"]).order("created_at", { ascending: false }),
  ]);

  const ready: ReadyMessage[] = (readyData.data || []).map((msg: any) => ({ id: msg.id, patientName: msg.placeholders?.PATIENT_NAME || "Unknown", phone: msg.phone, type: msg.type as "registration" | "receipt", language: msg.language, status: msg.status, createdAt: msg.created_at }));
  const scheduled: ScheduledReminder[] = (scheduledData.data || []).map((msg: any) => ({ id: msg.id, patientName: msg.placeholders?.PATIENT_NAME || "Unknown", doctorName: msg.placeholders?.DOCTOR_NAME || "your doctor", appointmentDate: msg.placeholders?.APPOINTMENT_DATE || "Unknown", appointmentTime: msg.placeholders?.APPOINTMENT_TIME || "Unknown", scheduledSendTime: msg.scheduled_send_time, status: msg.status }));
  const archive: ArchiveMessage[] = (archiveData.data || []).map((msg: any) => ({ id: msg.id, patientName: msg.placeholders?.PATIENT_NAME || "Unknown", messageType: msg.type, status: msg.status as "sent" | "failed" | "cancelled" | "expired", timestamp: msg.sent_at || msg.created_at, failureReason: msg.error_message }));

  return { ready, scheduled, archive };
}