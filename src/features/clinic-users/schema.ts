import { z } from 'zod'

export const clinicUserIdSchema = z.string().uuid('Invalid user ID')