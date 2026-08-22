import { z } from 'zod'

export const submitAppointmentRequestSchema = z.object({
  patientId: z.string().uuid('Invalid patient ID'),
  preferredDate: z
    .string()
    .min(1, 'Preferred date is required')
    .refine((val) => {
      const date = new Date(val)
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      return !isNaN(date.getTime()) && date >= today
    }, 'Preferred date must be today or a future date'),
  preferredTimeSlot: z.enum(['morning', 'afternoon', 'evening']).optional(),
  reason: z.string().max(500, 'Reason must be 500 characters or fewer').optional(),
})

export const cancelAppointmentRequestSchema = z.object({
  requestId: z.string().uuid('Invalid request ID'),
})

export const respondToAppointmentRequestSchema = z.object({
  requestId: z.string().uuid('Invalid request ID'),
  status: z.enum(['confirmed', 'rejected']),
  responseNote: z.string().max(500).optional(),
  confirmedAppointmentId: z.string().uuid().optional(),
})

// Explicit types (not z.infer) to avoid angle-bracket stripping in copy-paste
export type SubmitAppointmentRequestInput = {
  patientId: string
  preferredDate: string
  preferredTimeSlot?: 'morning' | 'afternoon' | 'evening'
  reason?: string
}

export type CancelAppointmentRequestInput = {
  requestId: string
}

export type RespondToAppointmentRequestInput = {
  requestId: string
  status: 'confirmed' | 'rejected'
  responseNote?: string
  confirmedAppointmentId?: string
}