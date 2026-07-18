import { z } from 'zod'

export const createClinicSchema = z.object({
  clinicName: z
    .string()
    .trim()
    .min(2, 'Clinic name must be at least 2 characters')
    .max(200, 'Clinic name is too long'),
})

export type CreateClinicInput = z.infer<typeof createClinicSchema>