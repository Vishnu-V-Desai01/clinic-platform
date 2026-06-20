// src/features/care-plans/schema.ts

import { z } from 'zod';

// Care Plan
export const carePlanFormSchema = z.object({
  notes: z.string().nullable().optional(),
});

export type CarePlanFormData = z.infer<typeof carePlanFormSchema>;

// Medicine
export const carePlanMedicineFormSchema = z.object({
  medicine_name: z.string().min(1, 'Medicine name is required'),
  strength: z.string().nullable().optional(),
  unit: z.string().nullable().optional(),
  frequency: z.string().min(1, 'Frequency is required'),
  duration_value: z.number().int().positive().nullable().optional(),
  duration_unit: z
    .enum(['days', 'weeks', 'months', 'ongoing'])
    .nullable()
    .optional(),
  instructions: z.string().nullable().optional(),
});

export type CarePlanMedicineFormData = z.infer<typeof carePlanMedicineFormSchema>;

// Follow-up
export const carePlanFollowUpFormSchema = z.object({
  description: z.string().min(1, 'Description is required'),
  scheduled_date: z.string().date().nullable().optional(),
  priority: z.enum(['high', 'medium', 'low']).nullable().optional(),
  status: z.enum(['pending', 'completed', 'cancelled']).default('pending'),
});

export type CarePlanFollowUpFormData = z.infer<typeof carePlanFollowUpFormSchema>;

// Suggestion
export const carePlanSuggestionFormSchema = z.object({
  suggestion_text: z.string().min(1, 'Suggestion text is required'),
  category: z
    .enum(['lifestyle', 'diet', 'exercise', 'precaution'])
    .nullable()
    .optional(),
});

export type CarePlanSuggestionFormData = z.infer<typeof carePlanSuggestionFormSchema>;

// Reminder
export const carePlanReminderFormSchema = z.object({
  reminder_type: z.enum(['medicine', 'follow_up', 'suggestion']),
  target_id: z.string().uuid().nullable().optional(),
  reminder_text: z.string().min(1, 'Reminder text is required'),
  frequency: z.string().min(1, 'Frequency is required'),
  start_date: z.string().date().nullable().optional(),
  end_date: z.string().date().nullable().optional(),
  enabled: z.boolean().default(true),
});

export type CarePlanReminderFormData = z.infer<typeof carePlanReminderFormSchema>;