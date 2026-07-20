// src/features/post-visit/types.ts

// ─── Step identity ─────────────────────────────────────────────────────────────

export type WizardStep =
  | 'prescriptions'
  | 'reminders'
  | 'encounter'
  | 'charges'
  | 'review'

export const WIZARD_STEPS: WizardStep[] = [
  'prescriptions',
  'reminders',
  'encounter',
  'charges',
  'review',
]

export const WIZARD_STEP_LABELS: Record<WizardStep, string> = {
  'prescriptions': 'Prescriptions',
  'reminders':     'Reminders',
  'encounter':     'Encounter',
  'charges':       'Charges',
  'review':        'Review',
}

// Steps the doctor can skip (review is always required for confirm)
export const SKIPPABLE_STEPS: WizardStep[] = [
  'prescriptions',
  'reminders',
  'encounter',
  'charges',
]

// ─── Shared value unions ───────────────────────────────────────────────────────

export type MealAssociation    = 'breakfast' | 'lunch' | 'dinner' | 'night' | 'any'
export type MealTiming         = 'before' | 'after' | 'with'
export type PrescriptionStatus = 'active' | 'completed' | 'stopped'
export type DiagnosisSeverity  = 'mild' | 'moderate' | 'severe'
export type DiagnosisStatus    = 'active' | 'resolved' | 'chronic'

// ─── Client-side wizard state types ───────────────────────────────────────────

export type PrescriptionLine = {
  localId:             string
  carePlanMedicineId?: string
  medicineName:        string
  dosage?:             string
  frequency?:          string
  duration?:           string
  instructions?:       string
  mealAssociation?:    MealAssociation
  mealTiming?:         MealTiming
  status:              PrescriptionStatus
  isDeleted:           boolean
}

export type MedicineReminderTime = {
  localId:         string
  medicineName:    string
  time:            string  // "HH:MM" 24-hour format
  duration?:       string  // "7", "14", etc. (number of days)
  mealAssociation?: string // "before_breakfast", "with_lunch", "before_bedtime", etc.
}

export type DiagnosisLine = {
  localId:       string
  conditionName: string
  severity?:     DiagnosisSeverity
  status:        DiagnosisStatus
  notes?:        string
}

export type ObservationLine = {
  localId:         string
  observationType: string
  value:           string
  unit?:           string
  notes?:          string
}

export type EncounterData = {
  chiefComplaint?: string
  notes?:          string
  diagnoses:       DiagnosisLine[]
  observations:    ObservationLine[]
}

export type ChargeLineItem = {
  localId:     string
  description: string
  quantity:    number
  unitPrice:   number
}

export type WizardState = {
  appointmentId: string
  patientId:     string
  currentStep:   WizardStep
  skipped:       WizardStep[]
  prescriptions: PrescriptionLine[]
  reminderTimes: MedicineReminderTime[]
  encounter:     EncounterData
  charges:       ChargeLineItem[]
}

// ─── Server prefill types ──────────────────────────────────────────────────────

export type VisitPrefill = {
  patientId:     string
  prescriptions: PrescriptionLine[]
  reminderTimes: MedicineReminderTime[]
  defaultFee?:   number
}

// ─── Server action payload ─────────────────────────────────────────────────────

export type CompleteVisitPayload = {
  appointmentId: string
  patientId:     string
  prescriptions: Array<{
    carePlanMedicineId?: string
    medicineName:        string
    dosage?:             string
    frequency?:          string
    duration?:           string
    instructions?:       string
    mealAssociation?:    MealAssociation
    mealTiming?:         MealTiming
    status:              PrescriptionStatus
    isDeleted:           boolean
  }> | null
  reminderTimes: Array<{
    medicineName:    string
    time:            string
    duration?:       string
    mealAssociation?: string
  }> | null
  encounter: {
    chiefComplaint?: string
    notes?:          string
    diagnoses: Array<{
      conditionName: string
      severity?:     DiagnosisSeverity
      status:        DiagnosisStatus
      notes?:        string
    }>
    observations: Array<{
      observationType: string
      value:           string
      unit?:           string
      notes?:          string
    }>
  } | null
  charges: Array<{
    description: string
    quantity:    number
    unitPrice:   number
  }> | null
}

// ─── Result types ──────────────────────────────────────────────────────────────

export type CompleteVisitResult =
  | {
      success:      true
      encounterId?: string
      paymentId?:   string
      warnings?:    string[]
    }
  | { success: false; error: string }

export type PrefillResult =
  | { success: true; data: VisitPrefill }
  | { success: false; error: string }