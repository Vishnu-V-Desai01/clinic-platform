// src/features/patients/schema.ts
//
// Server-side validation for the patient create/edit form, using Zod.
// The form sends camelCase values; this schema checks and cleans them
// BEFORE the server action writes anything to the database.

import { z } from "zod"

import {
  BLOOD_GROUPS,
  GENDER_OPTIONS,
  STATUS_OPTIONS,
  type BloodGroup,
  type Gender,
  type PatientStatus,
} from "./types"

const GENDER_VALUES = GENDER_OPTIONS.map((o) => o.value)
const STATUS_VALUES = STATUS_OPTIONS.map((o) => o.value)

/** A trimmed, optional text field that becomes null when left blank. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Must be ${max} characters or fewer`)
    .transform((v) => (v === "" ? null : v))

/** A list of short text tags (allergies, conditions). */
const tagList = z
  .array(z.string().trim().min(1).max(100))
  .max(50, "Too many entries")
  .default([])

/** Indian mobile: input is reduced to its digits, then checked. */
const mobileRequired = z
  .string()
  .transform((v) => v.replace(/\D/g, ""))
  .refine((v) => /^[6-9]\d{9}$/.test(v), {
    message: "Enter a valid 10-digit mobile number",
  })

const mobileOptional = z
  .string()
  .transform((v) => v.replace(/\D/g, ""))
  .refine((v) => v === "" || /^[6-9]\d{9}$/.test(v), {
    message: "Enter a valid 10-digit mobile number",
  })
  .transform((v) => (v === "" ? null : v))

export const LANGUAGE_OPTIONS = [
  { value: "kn", label: "Kannada" },
  { value: "en", label: "English" },
  { value: "hi", label: "Hindi" },
  { value: "ta", label: "Tamil" },
  { value: "gu", label: "Gujarati" },
] as const

const LANGUAGE_VALUES = LANGUAGE_OPTIONS.map((o) => o.value)

export const patientFormSchema = z.object({
  // --- Basic information ---
  firstName: z.string().trim().min(1, "First name is required").max(255),
  lastName: z.string().trim().min(1, "Last name is required").max(255),
  // Optional. Empty string becomes null (same pattern as bloodGroup /
  // assignedDoctorId below). When a value IS given, it still has to be a
  // real, non-future, post-1900 date.
  dateOfBirth: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .refine((v) => v === null || !Number.isNaN(Date.parse(v)), {
      message: "Enter a valid date",
    })
    .refine((v) => v === null || new Date(v) <= new Date(), {
      message: "Date of birth can't be in the future",
    })
    .refine((v) => v === null || new Date(v) >= new Date("1900-01-01"), {
      message: "Enter a valid date",
    }),
  gender: z
    .string()
    .refine((v): v is Gender => GENDER_VALUES.includes(v as Gender), {
      message: "Please select a gender",
    }),
  bloodGroup: z
    .string()
    .transform((v) => (v === "" ? null : v))
    .refine(
      (v): v is BloodGroup | null =>
        v === null || BLOOD_GROUPS.includes(v as BloodGroup),
      { message: "Invalid blood group" },
    ),
  status: z
    .string()
    .refine((v): v is PatientStatus => STATUS_VALUES.includes(v as PatientStatus), {
      message: "Invalid status",
    })
    .default("active"),

  // --- Doctor assignment ---
  // Shape-only validation here: "" becomes null, anything else must be a
  // uuid. Whether it's actually REQUIRED depends on who's submitting
  // (staff vs. doctor), which the schema has no way to know — that check
  // lives in actions.ts, alongside requireRole().
  assignedDoctorId: z
    .string()
    .transform((v) => (v === "" ? null : v))
    .refine((v) => v === null || z.string().uuid().safeParse(v).success, {
      message: "Invalid doctor selection",
    }),

  // --- Contact details ---
  phone: mobileRequired,
  email: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .refine((v) => v === null || z.string().email().safeParse(v).success, {
      message: "Enter a valid email address",
    }),
  addressLine: optionalText(1000),
  city: optionalText(100),
  state: optionalText(100),
  pincode: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .refine((v) => v === null || /^\d{6}$/.test(v), {
      message: "Pincode must be 6 digits",
    }),

  // --- Preferred language (WhatsApp messages) ---
  languagePreference: z
    .string()
    .refine((v) => LANGUAGE_VALUES.includes(v as typeof LANGUAGE_VALUES[number]), {
      message: "Invalid language",
    })
    .default("en"),

  // --- Emergency contact ---
  emergencyName: optionalText(255),
  emergencyRelationship: optionalText(100),
  emergencyPhone: mobileOptional,

  // --- Medical background ---
  allergies: tagList,
  conditions: tagList,
  notes: optionalText(5000),

  // --- DPDP consent (create mode only) ---
  // Shape-only here: a plain boolean, defaulting false if omitted. Whether
  // it's actually REQUIRED to be true depends on create vs. edit mode,
  // which — same as assignedDoctorId above — the schema can't know.
  // createPatient() in actions.ts rejects the submission if this is false;
  // updatePatient() ignores the field entirely.
  consentGiven: z.boolean().default(false),
})

/** What the form sends in (before cleaning). */
export type PatientFormInput = z.input<typeof patientFormSchema>
/** The cleaned, validated result the server action works with. */
export type PatientFormData = z.output<typeof patientFormSchema>