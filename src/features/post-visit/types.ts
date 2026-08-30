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
  // Issue 5 (edit mode): the SPECIFIC encounter-level prescriptions.id this
  // line was loaded from, when editing an already-completed visit. Distinct
  // from carePlanMedicineId, which tracks the ongoing care_plan_medicines
  // row — these are two different tables, one being the point-in-time
  // record of this visit, the other the patient's current medication list.
  // Undefined when this is a new line (not yet saved to either table).
  prescriptionId?:     string
  medicineName:        string
  // Catalogue reference (pharmacy_drugs.id), Chat B. Set when the doctor
  // picks the medicine via the autocomplete dropdown or the "select from
  // inventory" picker. Undefined for a free-typed name — that's allowed
  // (e.g. medicine not stocked, external pharmacy), and just means the
  // pharmacy queue will fall back to name-matching for this line.
  drugId?:             string
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
  // Issue 5 (edit mode): set when this line was loaded from an existing
  // diagnoses row (editing a completed visit). Undefined for a new line.
  diagnosisId?:  string
  conditionName: string
  severity?:     DiagnosisSeverity
  status:        DiagnosisStatus
  notes?:        string
  // Issue 5 (edit mode): true if the doctor/admin removed this line in the
  // wizard. Only meaningful when diagnosisId is set — a new (unsaved) line
  // marked deleted is simply dropped client-side, never sent to the server.
  isDeleted:     boolean
}

export type ObservationLine = {
  localId:         string
  // Issue 5 (edit mode): set when this line was loaded from an existing
  // observations row. Undefined for a new line.
  observationId?:  string
  observationType: string
  value:           string
  unit?:           string
  notes?:          string
  // Issue 5 (edit mode): see DiagnosisLine.isDeleted above — same rule.
  isDeleted:       boolean
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

  // ── Issue 5 additions (editing a completed appointment) ──────────────────

  // The appointment's current status ('scheduled' | 'completed' | ...).
  // Lets the caller distinguish "first-time completion" from "re-editing an
  // already-completed visit" without a separate mode flag — the presence
  // of encounterId (below) is the more precise signal for that, but the
  // raw status is useful for UI messaging ("Editing a completed visit").
  appointmentStatus: string

  // Set when an encounter already exists for this appointment (i.e. we are
  // in EDIT mode, prefilling from the saved visit record) — undefined when
  // this is the first time this appointment is being completed.
  encounterId?: string

  // Present (possibly empty) only in edit mode — the encounter's own
  // chief complaint / notes / diagnoses / observations, as actually saved,
  // which may differ from what's currently in the patient's ongoing care
  // plan (prescriptions above are prefilled from the care plan either way).
  encounterData?: EncounterData

  // Existing charge line items for this appointment's payment, if any —
  // shown for both editable and locked charges so the UI can render them
  // either way; canEditCharges/chargesLocked below say which.
  existingCharges: ChargeLineItem[]

  // Whether ANY money has been collected on this appointment's payment.
  // When true, charges must not be editable in the UI regardless of role —
  // the financial-integrity rule (approved + collected = immutable).
  chargesLocked: boolean

  // ── Permission flags, resolved server-side so the client doesn't have
  // to re-derive the doctor/admin/staff + treating-doctor logic itself ──
  canEditClinical:        boolean // diagnoses/observations/prescriptions/care plan/reminders
  canEditCharges:         boolean // false only if chargesLocked, or caller has no charge permission at all
  chargesRequireApproval: boolean // true when the caller is staff (not the treating doctor or an admin)
}

// ─── Server action payload ─────────────────────────────────────────────────────

export type CompleteVisitPayload = {
  appointmentId: string
  patientId:     string
  prescriptions: Array<{
    carePlanMedicineId?: string
    prescriptionId?:      string
    medicineName:        string
    drugId?:              string
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
      diagnosisId?:  string
      conditionName: string
      severity?:     DiagnosisSeverity
      status:        DiagnosisStatus
      notes?:        string
      isDeleted:     boolean
    }>
    observations: Array<{
      observationId?:  string
      observationType: string
      value:           string
      unit?:           string
      notes?:          string
      isDeleted:       boolean
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