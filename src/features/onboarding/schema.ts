import { z } from 'zod'

// Mirrors the optionality of clinic-settings-form.tsx / UpdateClinicSettingsSchema
// (src/features/clinic/schema.ts) — only clinic name and the admin's own
// name are required here. Kept as a separate schema, not reused directly,
// because onboarding's input shape (camelCase, single-step form) differs
// from the settings update shape (snake_case, matching DB columns).
export const createClinicSchema = z.object({
  // The signing-up doctor/admin's own name. Required: Clerk does not
  // always collect a display name (e.g. email/password sign-up), and
  // without this, profiles.full_name is null and every screen that shows
  // "Welcome, {name}" falls back to showing the person's email instead.
  fullName: z
    .string()
    .trim()
    .min(2, 'Please enter your name')
    .max(200, 'Name is too long'),

  clinicName: z
    .string()
    .trim()
    .min(2, 'Clinic name must be at least 2 characters')
    .max(200, 'Clinic name is too long'),

  address: z.string().trim().max(500).optional(),
  city: z.string().trim().max(100).optional(),
  state: z.string().trim().max(100).optional(),
  postalCode: z.string().trim().max(20).optional(),
  phone: z.string().trim().max(20).optional(),
  email: z.string().trim().max(200).optional(),
  licenseNumber: z.string().trim().max(100).optional(),
  gstNumber: z.string().trim().max(15).optional(),
  hfrId: z.string().trim().max(100).optional(),

  tosAccepted: z.boolean().refine((v) => v === true, {
    message: 'You must accept the Terms of Service and Privacy Policy to continue',
  }),
})

export type CreateClinicInput = z.infer<typeof createClinicSchema>