/**
 * Tests for src/features/medical-records/schema.ts
 * Pure Zod validation - no mocking needed.
 *
 * Important distinction from patients/consent schemas: fields here use
 * .optional().nullable() with NO empty-to-null transform. An empty
 * string stays "" (not null) - verified directly before writing these
 * assertions, not assumed from the pattern used elsewhere.
 *
 * addDiagnosisSchema/addObservationSchema/addPrescriptionSchema/
 * addTestResultSchema are the exact same object references as their
 * corresponding item schemas (plain aliases), so testing the item
 * schemas below also covers them - no separate tests needed for those.
 */

import {
  diagnosisItemSchema,
  observationItemSchema,
  prescriptionItemSchema,
  testResultItemSchema,
  newEncounterSchema,
  updateEncounterStatusSchema,
  updateDiagnosisStatusSchema,
  updatePrescriptionStatusSchema,
  updateTestResultSchema,
} from '../../../features/medical-records/schema'

describe('diagnosisItemSchema', () => {
  const valid = { condition_name: 'Hypertension', status: 'active' as const }

  it('accepts a minimal valid submission', () => {
    expect(diagnosisItemSchema.safeParse(valid).success).toBe(true)
  })

  it('requires condition_name', () => {
    const result = diagnosisItemSchema.safeParse({ ...valid, condition_name: '' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message === 'Condition name is required')).toBe(true)
    }
  })

  it('rejects condition_name over 255 characters', () => {
    const result = diagnosisItemSchema.safeParse({ ...valid, condition_name: 'A'.repeat(256) })
    expect(result.success).toBe(false)
  })

  it('defaults status to "active" when omitted', () => {
    const result = diagnosisItemSchema.safeParse({ condition_name: 'Flu' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.status).toBe('active')
  })

  it('rejects an invalid status', () => {
    const result = diagnosisItemSchema.safeParse({ ...valid, status: 'cured' })
    expect(result.success).toBe(false)
  })

  it.each(['mild', 'moderate', 'severe'])('accepts %s as a valid severity', (severity) => {
    expect(diagnosisItemSchema.safeParse({ ...valid, severity }).success).toBe(true)
  })

  it('accepts severity omitted (it is optional, no default)', () => {
    const result = diagnosisItemSchema.safeParse(valid)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.severity).toBeUndefined()
  })

  it('rejects an invalid severity', () => {
    expect(diagnosisItemSchema.safeParse({ ...valid, severity: 'critical' }).success).toBe(false)
  })

  it('an empty string for code stays "" - it is NOT converted to null', () => {
    const result = diagnosisItemSchema.safeParse({ ...valid, code: '' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.code).toBe('')
  })

  it('an omitted code is undefined', () => {
    const result = diagnosisItemSchema.safeParse(valid)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.code).toBeUndefined()
  })

  it('an explicit null code stays null', () => {
    const result = diagnosisItemSchema.safeParse({ ...valid, code: null })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.code).toBeNull()
  })

  it('rejects notes over 1000 characters', () => {
    const result = diagnosisItemSchema.safeParse({ ...valid, notes: 'A'.repeat(1001) })
    expect(result.success).toBe(false)
  })
})

describe('observationItemSchema', () => {
  const valid = { observation_type: 'blood_pressure', value: '120/80' }

  it('accepts a minimal valid submission', () => {
    expect(observationItemSchema.safeParse(valid).success).toBe(true)
  })

  it('requires observation_type', () => {
    const result = observationItemSchema.safeParse({ ...valid, observation_type: '' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message === 'Observation type is required')).toBe(true)
    }
  })

  it('requires value', () => {
    const result = observationItemSchema.safeParse({ ...valid, value: '' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message === 'Value is required')).toBe(true)
    }
  })

  it('rejects value over 255 characters', () => {
    expect(observationItemSchema.safeParse({ ...valid, value: 'A'.repeat(256) }).success).toBe(false)
  })

  it('accepts an optional unit', () => {
    const result = observationItemSchema.safeParse({ ...valid, unit: 'mmHg' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.unit).toBe('mmHg')
  })
})

describe('prescriptionItemSchema', () => {
  const valid = { medicine_name: 'Amoxicillin' }

  it('accepts a minimal valid submission', () => {
    expect(prescriptionItemSchema.safeParse(valid).success).toBe(true)
  })

  it('requires medicine_name', () => {
    const result = prescriptionItemSchema.safeParse({ medicine_name: '' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message === 'Medicine name is required')).toBe(true)
    }
  })

  it('defaults status to "active" when omitted', () => {
    const result = prescriptionItemSchema.safeParse(valid)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.status).toBe('active')
  })

  it.each(['active', 'stopped', 'completed'])('accepts %s as a valid status', (status) => {
    expect(prescriptionItemSchema.safeParse({ ...valid, status }).success).toBe(true)
  })

  it('rejects instructions over 1000 characters', () => {
    expect(
      prescriptionItemSchema.safeParse({ ...valid, instructions: 'A'.repeat(1001) }).success,
    ).toBe(false)
  })
})

describe('testResultItemSchema', () => {
  const valid = { test_name: 'CBC' }

  it('accepts a minimal valid submission', () => {
    expect(testResultItemSchema.safeParse(valid).success).toBe(true)
  })

  it('requires test_name', () => {
    expect(testResultItemSchema.safeParse({ test_name: '' }).success).toBe(false)
  })

  it('defaults status to "ordered" when omitted', () => {
    const result = testResultItemSchema.safeParse(valid)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.status).toBe('ordered')
  })

  it('defaults is_abnormal to false when omitted', () => {
    const result = testResultItemSchema.safeParse(valid)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.is_abnormal).toBe(false)
  })

  it('accepts is_abnormal explicitly set to true', () => {
    const result = testResultItemSchema.safeParse({ ...valid, is_abnormal: true })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.is_abnormal).toBe(true)
  })

  it.each(['ordered', 'pending', 'completed'])('accepts %s as a valid status', (status) => {
    expect(testResultItemSchema.safeParse({ ...valid, status }).success).toBe(true)
  })

  it('rejects result_text over 2000 characters', () => {
    expect(
      testResultItemSchema.safeParse({ ...valid, result_text: 'A'.repeat(2001) }).success,
    ).toBe(false)
  })
})

describe('newEncounterSchema', () => {
  const validEncounter = { encounter_date: '2026-07-15' }

  it('accepts a minimal encounter with no children', () => {
    const result = newEncounterSchema.safeParse(validEncounter)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.diagnoses).toEqual([])
      expect(result.data.observations).toEqual([])
      expect(result.data.prescriptions).toEqual([])
    }
  })

  it('requires encounter_date', () => {
    const result = newEncounterSchema.safeParse({ encounter_date: '' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message === 'Encounter date is required')).toBe(true)
    }
  })

  it('accepts an encounter with a full set of children', () => {
    const result = newEncounterSchema.safeParse({
      ...validEncounter,
      diagnoses: [{ condition_name: 'Flu', status: 'active' }],
      observations: [{ observation_type: 'temperature', value: '101.2' }],
      prescriptions: [{ medicine_name: 'Paracetamol' }],
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.diagnoses).toHaveLength(1)
      expect(result.data.observations).toHaveLength(1)
      expect(result.data.prescriptions).toHaveLength(1)
    }
  })

  it('rejects the whole submission if one diagnosis in the array is invalid', () => {
    const result = newEncounterSchema.safeParse({
      ...validEncounter,
      diagnoses: [{ condition_name: '', status: 'active' }],
    })
    expect(result.success).toBe(false)
  })

  it('rejects chief_complaint over 500 characters', () => {
    const result = newEncounterSchema.safeParse({
      ...validEncounter,
      chief_complaint: 'A'.repeat(501),
    })
    expect(result.success).toBe(false)
  })

  it('rejects notes over 5000 characters', () => {
    const result = newEncounterSchema.safeParse({ ...validEncounter, notes: 'A'.repeat(5001) })
    expect(result.success).toBe(false)
  })
})

describe('status update schemas', () => {
  it.each(['active', 'completed', 'cancelled'])('updateEncounterStatusSchema accepts %s', (status) => {
    expect(updateEncounterStatusSchema.safeParse({ status }).success).toBe(true)
  })

  it('updateEncounterStatusSchema rejects an unknown status', () => {
    expect(updateEncounterStatusSchema.safeParse({ status: 'archived' }).success).toBe(false)
  })

  it.each(['active', 'resolved', 'inactive'])('updateDiagnosisStatusSchema accepts %s', (status) => {
    expect(updateDiagnosisStatusSchema.safeParse({ status }).success).toBe(true)
  })

  it.each(['active', 'stopped', 'completed'])('updatePrescriptionStatusSchema accepts %s', (status) => {
    expect(updatePrescriptionStatusSchema.safeParse({ status }).success).toBe(true)
  })

  describe('updateTestResultSchema', () => {
    it('accepts a status-only update', () => {
      expect(updateTestResultSchema.safeParse({ status: 'completed' }).success).toBe(true)
    })

    it('accepts filling in results alongside the status', () => {
      const result = updateTestResultSchema.safeParse({
        status: 'completed',
        result_value: '14.2',
        result_text: 'Within normal limits',
        is_abnormal: false,
      })
      expect(result.success).toBe(true)
    })

    it('is_abnormal is optional here (unlike testResultItemSchema, no default)', () => {
      const result = updateTestResultSchema.safeParse({ status: 'completed' })
      expect(result.success).toBe(true)
      if (result.success) expect(result.data.is_abnormal).toBeUndefined()
    })

    it('rejects an unknown status', () => {
      expect(updateTestResultSchema.safeParse({ status: 'cancelled' }).success).toBe(false)
    })
  })
})