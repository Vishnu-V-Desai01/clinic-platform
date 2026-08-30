import { z } from "zod";

// ============================================================================
// Enums — single source of truth, mirrors the CHECK constraints from the
// Step 1 migration (and the medicine_receipt extension, Chat C; the
// prescription extension, Item 6). If these ever drift from the DB, fix
// them here first.
// ============================================================================

export const MESSAGE_TYPES = ["registration", "appointment", "receipt", "medicine_receipt", "prescription"] as const;
export const MESSAGE_STATUSES = ["pending", "sent", "failed", "cancelled", "expired"] as const;
export const MESSAGE_LANGUAGES = ["en", "hi", "ta", "gu", "kn"] as const;
export const DELIVERY_LOG_ACTIONS = ["created", "sent", "failed", "cancelled", "expired"] as const;

export const messageTypeSchema = z.enum(MESSAGE_TYPES);
export const messageStatusSchema = z.enum(MESSAGE_STATUSES);
export const messageLanguageSchema = z.enum(MESSAGE_LANGUAGES);
export const deliveryLogActionSchema = z.enum(DELIVERY_LOG_ACTIONS);

// ============================================================================
// Row schemas — shape of data as it comes back from Supabase.
// Deliberately permissive (e.g. placeholders, details) since these describe
// data that already exists in the DB, not data being validated on the way in.
// ============================================================================

export const messageTemplateRowSchema = z.object({
  id: z.uuid(),
  type: messageTypeSchema,
  language: messageLanguageSchema,
  content: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const messagePlaceholdersSchema = z.record(z.string(), z.string());

export const messageQueueRowSchema = z.object({
  id: z.uuid(),
  clinic_id: z.uuid(),
  patient_id: z.uuid(),
  appointment_id: z.uuid().nullable(),
  payment_id: z.uuid().nullable(),
  type: messageTypeSchema,
  language: messageLanguageSchema,
  phone: z.string(),
  placeholders: messagePlaceholdersSchema,
  status: messageStatusSchema,
  scheduled_send_time: z.string(),
  expires_at: z.string().nullable(),
  provider: z.string().nullable(),
  provider_message_id: z.string().nullable(),
  error_message: z.string().nullable(),
  sent_at: z.string().nullable(),
  cancelled_at: z.string().nullable(),
  cancelled_by: z.uuid().nullable(),
  created_by: z.uuid().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const messageDeliveryLogRowSchema = z.object({
  id: z.uuid(),
  clinic_id: z.uuid(),
  message_queue_id: z.uuid(),
  action: deliveryLogActionSchema,
  performed_by: z.uuid().nullable(),
  provider: z.string().nullable(),
  details: z.record(z.string(), z.unknown()).nullable(),
  created_at: z.string(),
});

export const clinicMessageUsageRowSchema = z.object({
  id: z.uuid(),
  clinic_id: z.uuid(),
  billing_month: z.string(),
  messages_sent: z.number().int(),
  included_limit: z.number().int(),
  overage_rate_paise: z.number().int(),
  overage_count: z.number().int(),
  overage_amount_paise: z.number().int(),
  is_settled: z.boolean(),
  settled_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const messagePaymentRowSchema = z.object({
  id: z.uuid(),
  clinic_id: z.uuid(),
  usage_id: z.uuid().nullable(),
  amount_paise: z.number().int(),
  payment_method: z.string().nullable(),
  payment_reference: z.string().nullable(),
  paid_by: z.uuid().nullable(),
  paid_at: z.string(),
  created_at: z.string(),
});

// ============================================================================
// Per-type placeholder schemas — every key the matching template needs.
// Used in Step 4 when building a message_queue row, so a missing placeholder
// fails at creation time instead of reaching a patient's WhatsApp.
// ============================================================================

export const registrationPlaceholdersSchema = z.object({
  CLINIC_NAME: z.string(),
  PATIENT_NAME: z.string(),
  EMAIL: z.string(),
  LOGIN_LINK: z.string(),
});

export const appointmentPlaceholdersSchema = z.object({
  PATIENT_NAME: z.string(),
  DOCTOR_NAME: z.string(),
  CLINIC_NAME: z.string(),
  APPOINTMENT_DATE: z.string(),
  APPOINTMENT_TIME: z.string(),
  DASHBOARD_LINK: z.string(),
  CLINIC_PHONE: z.string(),
});

export const receiptPlaceholdersSchema = z.object({
  PATIENT_NAME: z.string(),
  CLINIC_NAME: z.string(),
  RECEIPT_LINK: z.string(),
  PROFILE_LINK: z.string(),
});

// Chat C — medicine receipts have no treatment_details counterpart, so this
// is a strict subset of receiptPlaceholdersSchema (no PROFILE_LINK),
// not a reuse of it.
export const medicineReceiptPlaceholdersSchema = z.object({
  PATIENT_NAME: z.string(),
  CLINIC_NAME: z.string(),
  RECEIPT_LINK: z.string(),
});

// Item 6 — prescription documents have no payment to anchor to, so this
// carries doctor/visit-date context the receipt schemas don't need, and
// has no RECEIPT_LINK/PROFILE_LINK equivalent of its own.
export const prescriptionPlaceholdersSchema = z.object({
  PATIENT_NAME: z.string(),
  CLINIC_NAME: z.string(),
  DOCTOR_NAME: z.string(),
  VISIT_DATE: z.string(),
  PDF_LINK: z.string(),
});

// ============================================================================
// Input schemas — what the Step 4 server actions accept and validate
// ============================================================================

export const createRegistrationMessageInputSchema = z.object({
  patientId: z.uuid(),
});

export const createAppointmentMessageInputSchema = z.object({
  appointmentId: z.uuid(),
});

export const createReceiptMessageInputSchema = z.object({
  paymentId: z.uuid(),
});

export const createPrescriptionMessageInputSchema = z.object({
  encounterId: z.uuid(),
});

export const sendMessageInputSchema = z.object({
  messageId: z.uuid(),
});

export const sendAllMessagesInputSchema = z.object({
  messageIds: z.array(z.uuid()).min(1, "Select at least one message to send"),
});

export const cancelMessageInputSchema = z.object({
  messageId: z.uuid(),
});

export const recordOveragePaymentInputSchema = z.object({
  clinicId: z.uuid(),
  usageId: z.uuid().optional(),
  amountPaise: z.number().int().positive(),
  paymentMethod: z.string().optional(),
  paymentReference: z.string().optional(),
});