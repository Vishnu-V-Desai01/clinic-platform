export type ConsentPurpose =
  | 'data_processing'
  | 'appointment_reminders'
  | 'medication_reminders'
  | 'whatsapp_notifications'
  | 'care_plan_access'
  | 'record_sharing';

export const CONSENT_PURPOSES: ConsentPurpose[] = [
  'data_processing',
  'appointment_reminders',
  'medication_reminders',
  'whatsapp_notifications',
  'care_plan_access',
  'record_sharing',
];

export const CONSENT_PURPOSE_LABELS: Record<ConsentPurpose, string> = {
  data_processing:        'General Data Processing',
  appointment_reminders:  'Appointment Reminders',
  medication_reminders:   'Medication Reminders',
  whatsapp_notifications: 'WhatsApp Notifications',
  care_plan_access:       'Care Plan & Record Access',
  record_sharing:         'Record Sharing',
};

export const CONSENT_PURPOSE_DESCRIPTIONS: Record<ConsentPurpose, string> = {
  data_processing:
    'Processing of personal health data for clinical care under DPDP Act 2023.',
  appointment_reminders:
    'Sending appointment booking, rescheduling, and cancellation notifications.',
  medication_reminders:
    'Sending medication schedule and adherence reminders.',
  whatsapp_notifications:
    'Sending any clinic communications via WhatsApp.',
  care_plan_access:
    'Staff access to care plans, treatment records, and medical history.',
  record_sharing:
    'Sharing health records with other healthcare providers on referral.',
};

export type PatientConsent = {
  id:              string;
  clinic_id:       string;
  patient_id:      string;
  purpose:         ConsentPurpose;
  is_active:       boolean;
  granted_by:      string | null;
  granted_at:      string;
  revoked_by:      string | null;
  revoked_at:      string | null;
  notes:           string | null;
  abdm_consent_id: string | null;
  created_at:      string;
  updated_at:      string;
};