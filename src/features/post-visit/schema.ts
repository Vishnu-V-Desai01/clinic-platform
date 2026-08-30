// src/features/post-visit/schema.ts

import { z } from 'zod'

// ─── Prescription line ─────────────────────────────────────────────────────────

export const prescriptionLineSchema = z.object({
  carePlanMedicineId: z.string().uuid().optional(),
  // Issue 5 (edit mode): the specific encounter-level prescriptions.id —
  // see the comment on PrescriptionLine.prescriptionId in types.ts.
  prescriptionId:     z.string().uuid().optional(),
  medicineName:       z.string().min(1, 'Medicine name is required').trim(),
  // Catalogue reference (pharmacy_drugs.id), Chat B — optional, set only
  // when the doctor picked the medicine via autocomplete/catalogue picker.
  drugId:             z.string().uuid().optional(),
  dosage:             z.string().trim().optional(),
  frequency:          z.string().trim().optional(),
  duration:           z.string().trim().optional(),
  instructions:       z.string().trim().optional(),
  mealAssociation:    z
    .enum(['breakfast', 'lunch', 'dinner', 'night', 'any'])
    .optional(),
  mealTiming:         z.enum(['before', 'after', 'with']).optional(),
  status:             z.enum(['active', 'completed', 'stopped']).default('active'),
  isDeleted:          z.boolean().default(false),
})

// ─── Medicine reminder time ───────────────────────────────────────────────────────

export const medicineReminderTimeSchema = z.object({
  medicineName:    z.string().min(1, 'Medicine name required'),
  time:            z.string().regex(/^\d{2}:\d{2}$/, 'Time must be HH:MM format'),
  duration:        z.string().optional(),
  mealAssociation: z.string().optional(),
})

// ─── Encounter children ────────────────────────────────────────────────────────

export const diagnosisLineSchema = z.object({
  // Issue 5 (edit mode): set when editing an existing diagnoses row.
  diagnosisId:   z.string().uuid().optional(),
  conditionName: z.string().min(1, 'Condition name is required').trim(),
  severity:      z.enum(['mild', 'moderate', 'severe']).optional(),
  status:        z.enum(['active', 'resolved', 'chronic']).default('active'),
  notes:         z.string().trim().optional(),
  isDeleted:     z.boolean().default(false),
})

export const observationLineSchema = z.object({
  // Issue 5 (edit mode): set when editing an existing observations row.
  observationId:   z.string().uuid().optional(),
  observationType: z.string().min(1, 'Observation type is required').trim(),
  value:           z.string().min(1, 'Value is required').trim(),
  unit:            z.string().trim().optional(),
  notes:           z.string().trim().optional(),
  isDeleted:       z.boolean().default(false),
})

// ─── Encounter ─────────────────────────────────────────────────────────────────

export const encounterDataSchema = z.object({
  chiefComplaint: z.string().trim().optional(),
  notes:          z.string().trim().optional(),
  diagnoses:      z.array(diagnosisLineSchema).default([]),
  observations:   z.array(observationLineSchema).default([]),
})

// ─── Charge line items ─────────────────────────────────────────────────────────

export const chargeLineItemSchema = z.object({
  description: z.string().min(1, 'Description is required').trim(),
  quantity:    z.number().int().min(1, 'Quantity must be at least 1').default(1),
  unitPrice:   z.number().positive('Price must be greater than ₹0'),
})

// ─── Master payload ────────────────────────────────────────────────────────────

export const completeVisitSchema = z.object({
  appointmentId: z.string().uuid('Invalid appointment ID'),
  patientId:     z.string().uuid('Invalid patient ID'),
  prescriptions: z.array(prescriptionLineSchema).nullable(),
  reminderTimes: z.array(medicineReminderTimeSchema).nullable(),
  encounter:     encounterDataSchema.nullable(),
  charges:       z.array(chargeLineItemSchema).nullable(),
})

export type CompleteVisitInput = z.infer<typeof completeVisitSchema>