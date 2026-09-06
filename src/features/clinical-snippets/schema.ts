// src/features/clinical-snippets/schema.ts

import { z } from 'zod'

export const snippetFormSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(100, 'Title must be 100 characters or fewer'),
  body:  z.string().trim().min(1, 'Snippet text is required').max(5000, 'Snippet must be 5000 characters or fewer'),
})

export type SnippetFormData = z.infer<typeof snippetFormSchema>