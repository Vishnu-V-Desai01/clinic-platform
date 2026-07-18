import { z } from 'zod'

export const requestFamilyAccessSchema = z.object({
  familyCode: z.string().trim().min(1, "Enter the family's Unique Family ID"),
  requestNote: z.string().trim().max(500, 'Note is too long').optional(),
})

export type RequestFamilyAccessInput = z.infer<typeof requestFamilyAccessSchema>

export const respondToAccessRequestSchema = z.object({
  requestId: z.string().uuid('Invalid request ID'),
  patientId: z.string().uuid('Invalid patient card ID'),
})

export type RespondToAccessRequestInput = z.infer<typeof respondToAccessRequestSchema>

export const accessGrantIdSchema = z.string().uuid('Invalid request ID')