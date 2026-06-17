import { z } from 'zod';

export const consentPurposeSchema = z.enum([
  'data_processing',
  'appointment_reminders',
  'medication_reminders',
  'whatsapp_notifications',
  'care_plan_access',
  'record_sharing',
]);

export const grantConsentSchema = z.object({
  patient_id: z.string().uuid('Invalid patient ID'),
  purpose:    consentPurposeSchema,
  notes:      z.string().max(500, 'Notes must be 500 characters or fewer').optional(),
});

export const revokeConsentSchema = z.object({
  consent_id: z.string().uuid('Invalid consent ID'),
  notes:      z.string().max(500, 'Notes must be 500 characters or fewer').optional(),
});

export type GrantConsentInput  = z.infer<typeof grantConsentSchema>;
export type RevokeConsentInput = z.infer<typeof revokeConsentSchema>;