import { z } from "zod";
import {
  messageTypeSchema,
  messageStatusSchema,
  messageLanguageSchema,
  deliveryLogActionSchema,
  messageTemplateRowSchema,
  messageQueueRowSchema,
  messageDeliveryLogRowSchema,
  clinicMessageUsageRowSchema,
  messagePaymentRowSchema,
  messagePlaceholdersSchema,
  registrationPlaceholdersSchema,
  appointmentPlaceholdersSchema,
  receiptPlaceholdersSchema,
  medicineReceiptPlaceholdersSchema,
  prescriptionPlaceholdersSchema,
  createRegistrationMessageInputSchema,
  createAppointmentMessageInputSchema,
  createReceiptMessageInputSchema,
  createPrescriptionMessageInputSchema,
  sendMessageInputSchema,
  sendAllMessagesInputSchema,
  cancelMessageInputSchema,
  recordOveragePaymentInputSchema,
} from "./schema";

export type MessageType = z.infer<typeof messageTypeSchema>;
export type MessageStatus = z.infer<typeof messageStatusSchema>;
export type MessageLanguage = z.infer<typeof messageLanguageSchema>;
export type DeliveryLogAction = z.infer<typeof deliveryLogActionSchema>;

export type MessageTemplate = z.infer<typeof messageTemplateRowSchema>;
export type MessageQueueItem = z.infer<typeof messageQueueRowSchema>;
export type MessageDeliveryLog = z.infer<typeof messageDeliveryLogRowSchema>;
export type ClinicMessageUsage = z.infer<typeof clinicMessageUsageRowSchema>;
export type MessagePayment = z.infer<typeof messagePaymentRowSchema>;

export type MessagePlaceholders = z.infer<typeof messagePlaceholdersSchema>;
export type RegistrationPlaceholders = z.infer<typeof registrationPlaceholdersSchema>;
export type AppointmentPlaceholders = z.infer<typeof appointmentPlaceholdersSchema>;
export type ReceiptPlaceholders = z.infer<typeof receiptPlaceholdersSchema>;
export type MedicineReceiptPlaceholders = z.infer<typeof medicineReceiptPlaceholdersSchema>;
export type PrescriptionPlaceholders = z.infer<typeof prescriptionPlaceholdersSchema>;

export type CreateRegistrationMessageInput = z.infer<typeof createRegistrationMessageInputSchema>;
export type CreateAppointmentMessageInput = z.infer<typeof createAppointmentMessageInputSchema>;
export type CreateReceiptMessageInput = z.infer<typeof createReceiptMessageInputSchema>;
export type CreatePrescriptionMessageInput = z.infer<typeof createPrescriptionMessageInputSchema>;
export type SendMessageInput = z.infer<typeof sendMessageInputSchema>;
export type SendAllMessagesInput = z.infer<typeof sendAllMessagesInputSchema>;
export type CancelMessageInput = z.infer<typeof cancelMessageInputSchema>;
export type RecordOveragePaymentInput = z.infer<typeof recordOveragePaymentInputSchema>;

// UI-only grouping — not stored in the DB, derived when messages are queried.
// "immediate" = registration + receipt + medicine_receipt + prescription
//   (sendable as soon as created)
// "scheduled" = appointment messages (appear at 4:30 AM on appointment day)
// "archive"   = anything no longer pending (sent / cancelled / expired / failed)
export type MessageCluster = "immediate" | "scheduled" | "archive";