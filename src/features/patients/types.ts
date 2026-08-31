// src/features/patients/types.ts
//
// All patient-related types live here — one source of truth.
// Convention: data is always in DATABASE form (gender "male", status
// "active"). Friendly labels ("Male", "Active") are applied only when
// rendering, via the *_OPTIONS lists and *Label helpers below.

/* ----------------------------- Value types ------------------------------ */

export type Gender = "male" | "female" | "other" | "prefer_not_to_say"

export type PatientStatus = "active" | "inactive" | "archived"

export type BloodGroup =
  | "A+" | "A-" | "B+" | "B-" | "AB+" | "AB-" | "O+" | "O-"

export type LanguagePreference = "en" | "hi" | "ta" | "gu" | "kn"

/* ------------------------- Database row (snake_case) --------------------- */
// Mirrors the `patients` table exactly. This is what a SELECT returns.

export interface PatientRecord {
  id: string
  clinic_id: string
  assigned_doctor_id: string | null // which doctor's dashboard/panel this patient belongs to
  first_name: string
  last_name: string
  date_of_birth: string | null // "YYYY-MM-DD"
  gender: Gender | null
  email: string | null
  phone: string
  address: string | null
  city: string | null
  state: string | null
  postal_code: string | null
  language_preference: LanguagePreference | null
  emergency_contact_name: string | null
  emergency_contact_phone: string | null
  emergency_contact_relationship: string | null
  patient_id_number: string | null // the MRN, e.g. "CLI-2026-000001"
  blood_group: BloodGroup | null
  status: PatientStatus
  allergies: string[]
  conditions: string[]
  notes: string | null
  deleted_at: string | null
  created_at: string
  updated_at: string
}

/* --------------------------- Form values (camelCase) --------------------- */
// What the create/edit form works with. `mrn` is display-only: the database
// generates it on create and it never changes.
//
// `consentGiven`: only meaningful in "create" mode — captures that the
// patient (or their guardian) was informed and consented to data
// processing and WhatsApp communication at the point of registration, per
// DPDP Act 2023 Section 6. patient-form.tsx only renders the checkbox and
// enforces it in create mode; actions.ts's updatePatient ignores this
// field entirely, since consent status for an existing patient is managed
// via the patient portal's granular consent toggles, not the edit form.
export interface PatientFormValues {
  firstName: string
  lastName: string
  dateOfBirth: string
  gender: Gender | ""
  bloodGroup: BloodGroup | ""
  mrn: string
  status: PatientStatus
  assignedDoctorId: string // "" = unset. Ignored for role "doctor", required for "staff".
  phone: string
  email: string
  addressLine: string
  city: string
  state: string
  pincode: string
  languagePreference: LanguagePreference
  emergencyName: string
  emergencyRelationship: string
  emergencyPhone: string
  allergies: string[]
  conditions: string[]
  notes: string
  consentGiven: boolean
}

/* ------------------------- List row (display shape) ---------------------- */
// The compact shape the patients table renders. `age` is derived from DOB.

export interface PatientListItem {
  id: string
  mrn: string
  firstName: string
  lastName: string
  age: number | null
  gender: Gender | null
  phone: string
  status: PatientStatus
}

/* ----------------------------- Dropdown options -------------------------- */
// Single source for the selects. value = stored in DB, label = shown to user.

export const GENDER_OPTIONS: ReadonlyArray<{ value: Gender; label: string }> = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
]

export const STATUS_OPTIONS: ReadonlyArray<{ value: PatientStatus; label: string }> = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "archived", label: "Archived" },
]

export const BLOOD_GROUPS: ReadonlyArray<BloodGroup> = [
  "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-",
]

// Emergency-contact relationship is free text in the DB; these are suggestions.
export const RELATIONSHIP_OPTIONS: ReadonlyArray<string> = [
  "Spouse", "Parent", "Child", "Sibling", "Friend", "Guardian", "Other",
]

/* ------------------------------- Helpers --------------------------------- */

export function genderLabel(value: Gender | null): string {
  return GENDER_OPTIONS.find((o) => o.value === value)?.label ?? "—"
}

export function statusLabel(value: PatientStatus): string {
  return STATUS_OPTIONS.find((o) => o.value === value)?.label ?? value
}

/** Whole-year age from a "YYYY-MM-DD" date of birth. */
export function calculateAge(dateOfBirth: string | null): number | null {
  if (!dateOfBirth) return null
  const dob = new Date(dateOfBirth)
  if (Number.isNaN(dob.getTime())) return null
  const today = new Date()
  let age = today.getFullYear() - dob.getFullYear()
  const monthDiff = today.getMonth() - dob.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age -= 1
  }
  return age
}