import { z } from 'zod'

export const createInvitationSchema = z
  .object({
    email: z.string().email('Enter a valid email address'),
    role: z.enum(['doctor', 'staff']),
    staffType: z.enum(['receptionist', 'nurse', 'assistant', 'pharmacist']).nullable(),
  })
  .refine((data) => data.role !== 'staff' || data.staffType !== null, {
    message: 'Staff type is required when inviting staff',
    path: ['staffType'],
  })
  .refine((data) => data.role !== 'doctor' || data.staffType === null, {
    message: 'Staff type should not be set when inviting a doctor',
    path: ['staffType'],
  })

export type CreateInvitationInput = z.infer<typeof createInvitationSchema>