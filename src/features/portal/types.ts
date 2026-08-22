// All types for the patient portal read layer (Chat 21).
// These are view-only projections — no mutation types live here.

export type PortalAppointment = {
  id: string
  appointmentDate: string
  status: string
  notes: string | null
  cancellationReason: string | null
  createdAt: string
}

export type PortalDiagnosis = {
  id: string
  conditionName: string
  severity: string | null
  status: string
  notes: string | null
  createdAt: string
}

export type PortalObservation = {
  id: string
  observationType: string
  value: string
  unit: string | null
  notes: string | null
  createdAt: string
}

export type PortalPrescription = {
  id: string
  medicineName: string
  dosage: string | null
  frequency: string | null
  duration: string | null
  instructions: string | null
  status: string
  createdAt: string
}

export type PortalTestResult = {
  id: string
  testName: string
  resultValue: string | null
  resultText: string | null
  referenceRange: string | null
  isAbnormal: boolean
  status: string
  notes: string | null
  createdAt: string
}

export type PortalEncounter = {
  id: string
  encounterDate: string
  chiefComplaint: string | null
  notes: string | null
  status: string
  diagnoses: PortalDiagnosis[]
  observations: PortalObservation[]
  prescriptions: PortalPrescription[]
  testResults: PortalTestResult[]
}

export type PortalCarePlanMedicine = {
  id: string
  medicineName: string
  strength: string | null
  unit: string | null
  frequency: string
  durationValue: number | null
  durationUnit: string | null
  instructions: string | null
}

export type PortalCarePlanFollowUp = {
  id: string
  description: string
  scheduledDate: string | null
  priority: string | null
  status: string
}

export type PortalCarePlanSuggestion = {
  id: string
  suggestionText: string
  category: string | null
}

export type PortalCarePlan = {
  id: string
  notes: string | null
  updatedAt: string
  medicines: PortalCarePlanMedicine[]
  followUps: PortalCarePlanFollowUp[]
  suggestions: PortalCarePlanSuggestion[]
}

export type PortalPayment = {
  id: string
  amountCharged: number
  amountPaid: number
  outstandingBalance: number
  paymentStatus: string
  approvalStatus: string
  createdAt: string
}

// Full card detail returned by getPatientCardDetail().
// clinicName is resolved via list_my_family_patient_cards() inside
// the action so patients don't need direct SELECT on clinics.
//
// Demographic/contact/emergency-contact fields mirror exactly what
// toDbRow() in features/patients/actions.ts writes to the patients
// table — the doctor-side write path is the source of truth for
// which columns exist. Consent is intentionally excluded per the
// patient-ownership design: consent lives on its own page (/portal/consents),
// not folded into the card view.
export type PortalCardDetail = {
  patientId: string
  firstName: string
  lastName: string
  clinicName: string
  mrn: string | null
  dateOfBirth: string | null
  gender: string | null
  bloodGroup: string | null
  status: string
  phone: string | null
  email: string | null
  address: string | null
  city: string | null
  state: string | null
  postalCode: string | null
  languagePreference: string | null
  emergencyContactName: string | null
  emergencyContactPhone: string | null
  emergencyContactRelationship: string | null
  allergies: string[]
  conditions: string[]
  notes: string | null
  encounters: PortalEncounter[]
  appointments: PortalAppointment[]
  payments: PortalPayment[]
  carePlan: PortalCarePlan | null
}

export type PortalStatus = {
  familyCode: string
  isOnboarded: boolean
}