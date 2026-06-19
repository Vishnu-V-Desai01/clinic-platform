import { z } from 'zod'

// ---------------------------------------------------------------
// ITEM SCHEMAS
// Used both inside the new encounter form AND standalone
// when adding a single item to an existing encounter
// ---------------------------------------------------------------

export const diagnosisItemSchema = z.object({
  condition_name: z.string().min(1, 'Condition name is required').max(255).trim(),
  code:           z.string().max(50).trim().optional().nullable(),
  code_system:    z.string().max(50).trim().optional().nullable(),
  severity:       z.enum(['mild', 'moderate', 'severe']).optional().nullable(),
  status:         z.enum(['active', 'resolved', 'inactive']).default('active'),
  notes:          z.string().max(1000).trim().optional().nullable(),
})

export const observationItemSchema = z.object({
  observation_type: z.string().min(1, 'Observation type is required').max(100).trim(),
  value:            z.string().min(1, 'Value is required').max(255).trim(),
  unit:             z.string().max(50).trim().optional().nullable(),
  code:             z.string().max(50).trim().optional().nullable(),
  code_system:      z.string().max(50).trim().optional().nullable(),
  notes:            z.string().max(1000).trim().optional().nullable(),
})

export const prescriptionItemSchema = z.object({
  medicine_name: z.string().min(1, 'Medicine name is required').max(255).trim(),
  dosage:        z.string().max(100).trim().optional().nullable(),
  frequency:     z.string().max(100).trim().optional().nullable(),
  duration:      z.string().max(100).trim().optional().nullable(),
  instructions:  z.string().max(1000).trim().optional().nullable(),
  status:        z.enum(['active', 'stopped', 'completed']).default('active'),
})

export const testResultItemSchema = z.object({
  test_name:       z.string().min(1, 'Test name is required').max(255).trim(),
  result_value:    z.string().max(255).trim().optional().nullable(),
  result_text:     z.string().max(2000).trim().optional().nullable(),
  reference_range: z.string().max(255).trim().optional().nullable(),
  is_abnormal:     z.boolean().default(false),
  status:          z.enum(['ordered', 'pending', 'completed']).default('ordered'),
  code:            z.string().max(50).trim().optional().nullable(),
  code_system:     z.string().max(50).trim().optional().nullable(),
  notes:           z.string().max(1000).trim().optional().nullable(),
})

// ---------------------------------------------------------------
// NEW ENCOUNTER FORM SCHEMA
// One submission creates the encounter row + all children atomically
// Children default to empty arrays — doctor can create encounter
// with just notes and add diagnoses/vitals/Rx afterwards
// ---------------------------------------------------------------
export const newEncounterSchema = z.object({
  encounter_date:  z.string().min(1, 'Encounter date is required'),
  chief_complaint: z.string().max(500).trim().optional().nullable(),
  notes:           z.string().max(5000).trim().optional().nullable(),
  diagnoses:       z.array(diagnosisItemSchema).default([]),
  observations:    z.array(observationItemSchema).default([]),
  prescriptions:   z.array(prescriptionItemSchema).default([]),
})

// ---------------------------------------------------------------
// ADD SINGLE ITEM TO EXISTING ENCOUNTER
// Aliases — same shape as item schemas above, named for clarity
// ---------------------------------------------------------------
export const addDiagnosisSchema    = diagnosisItemSchema
export const addObservationSchema  = observationItemSchema
export const addPrescriptionSchema = prescriptionItemSchema
export const addTestResultSchema   = testResultItemSchema

// ---------------------------------------------------------------
// STATUS UPDATE SCHEMAS
// ---------------------------------------------------------------
export const updateEncounterStatusSchema = z.object({
  status: z.enum(['active', 'completed', 'cancelled']),
})

export const updateDiagnosisStatusSchema = z.object({
  status: z.enum(['active', 'resolved', 'inactive']),
})

export const updatePrescriptionStatusSchema = z.object({
  status: z.enum(['active', 'stopped', 'completed']),
})

// Test result updates also allow filling in results that came back from lab
export const updateTestResultSchema = z.object({
  status:          z.enum(['ordered', 'pending', 'completed']),
  result_value:    z.string().max(255).trim().optional().nullable(),
  result_text:     z.string().max(2000).trim().optional().nullable(),
  reference_range: z.string().max(255).trim().optional().nullable(),
  is_abnormal:     z.boolean().optional(),
  notes:           z.string().max(1000).trim().optional().nullable(),
})

// ---------------------------------------------------------------
// INFERRED TYPES
// ---------------------------------------------------------------
export type NewEncounterFormData        = z.infer<typeof newEncounterSchema>
export type DiagnosisItemData           = z.infer<typeof diagnosisItemSchema>
export type ObservationItemData         = z.infer<typeof observationItemSchema>
export type PrescriptionItemData        = z.infer<typeof prescriptionItemSchema>
export type TestResultItemData          = z.infer<typeof testResultItemSchema>
export type UpdateEncounterStatusData   = z.infer<typeof updateEncounterStatusSchema>
export type UpdateDiagnosisStatusData   = z.infer<typeof updateDiagnosisStatusSchema>
export type UpdatePrescriptionStatusData = z.infer<typeof updatePrescriptionStatusSchema>
export type UpdateTestResultData        = z.infer<typeof updateTestResultSchema>