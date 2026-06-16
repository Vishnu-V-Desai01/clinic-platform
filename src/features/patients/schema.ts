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

export const patientFormSchema = z.object({
  // --- Basic information ---
  firstName: z.string().trim().min(1, "First name is required").max(255),
  lastName: z.string().trim().min(1, "Last name is required").max(255),
  dateOfBirth: z
    .string()
    .min(1, "Date of birth is required")
    .refine((v) => !Number.isNaN(Date.parse(v)), { message: "Enter a valid date" })
    .refine((v) => new Date(v) <= new Date(), {
      message: "Date of birth can't be in the future",
    })
    .refine((v) => new Date(v) >= new Date("1900-01-01"), {
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

  // --- Emergency contact ---
  emergencyName: optionalText(255),
  emergencyRelationship: optionalText(100),
  emergencyPhone: mobileOptional,

  // --- Medical background ---
  allergies: tagList,
  conditions: tagList,
  notes: optionalText(5000),
})

/** What the form sends in (before cleaning). */
export type PatientFormInput = z.input<typeof patientFormSchema>
/** The cleaned, validated result the server action works with. */
export type PatientFormData = z.output<typeof patientFormSchema>