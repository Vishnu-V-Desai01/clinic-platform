/**
 * Tests for src/features/consent/schema.ts
 * Pure Zod validation - no mocking needed.
 */

import { grantConsentSchema, revokeConsentSchema } from '../../../features/consent/schema'

const VALID_UUID = '874ad51a-b42d-4ac8-b988-55ac10645308'

describe('grantConsentSchema', () => {
  it('accepts a valid submission with notes', () => {
    const result = grantConsentSchema.safeParse({
      patient_id: VALID_UUID,
      purpose: 'data_processing',
      notes: 'Patient verbally confirmed',
    })
    expect(result.success).toBe(true)
  })

  it('accepts a valid submission with notes omitted entirely (optional, not required)', () => {
    const result = grantConsentSchema.safeParse({
      patient_id: VALID_UUID,
      purpose: 'data_processing',
    })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.notes).toBeUndefined()
  })

  it('accepts an empty string for notes as-is (no empty-to-null transform, unlike patients/schema.ts)', () => {
    const result = grantConsentSchema.safeParse({
      patient_id: VALID_UUID,
      purpose: 'data_processing',
      notes: '',
    })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.notes).toBe('')
  })

  it('rejects a non-uuid patient_id', () => {
    const result = grantConsentSchema.safeParse({
      patient_id: 'not-a-uuid',
      purpose: 'data_processing',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message === 'Invalid patient ID')).toBe(true)
    }
  })

  it.each([
    'data_processing',
    'appointment_reminders',
    'medication_reminders',
    'whatsapp_notifications',
    'care_plan_access',
    'record_sharing',
  ])('accepts %s as a valid purpose', (purpose) => {
    const result = grantConsentSchema.safeParse({ patient_id: VALID_UUID, purpose })
    expect(result.success).toBe(true)
  })

  it('rejects a purpose outside the known set', () => {
    const result = grantConsentSchema.safeParse({
      patient_id: VALID_UUID,
      purpose: 'marketing_emails',
    })
    expect(result.success).toBe(false)
  })

  it('rejects notes over 500 characters', () => {
    const result = grantConsentSchema.safeParse({
      patient_id: VALID_UUID,
      purpose: 'data_processing',
      notes: 'A'.repeat(501),
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(
        result.error.issues.some((i) => i.message === 'Notes must be 500 characters or fewer'),
      ).toBe(true)
    }
  })

  it('accepts notes at exactly 500 characters', () => {
    const result = grantConsentSchema.safeParse({
      patient_id: VALID_UUID,
      purpose: 'data_processing',
      notes: 'A'.repeat(500),
    })
    expect(result.success).toBe(true)
  })
})

describe('revokeConsentSchema', () => {
  it('accepts a valid submission', () => {
    const result = revokeConsentSchema.safeParse({
      consent_id: VALID_UUID,
      notes: 'Patient requested withdrawal',
    })
    expect(result.success).toBe(true)
  })

  it('accepts notes omitted', () => {
    const result = revokeConsentSchema.safeParse({ consent_id: VALID_UUID })
    expect(result.success).toBe(true)
  })

  it('rejects a non-uuid consent_id', () => {
    const result = revokeConsentSchema.safeParse({ consent_id: 'not-a-uuid' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message === 'Invalid consent ID')).toBe(true)
    }
  })

  it('rejects notes over 500 characters', () => {
    const result = revokeConsentSchema.safeParse({
      consent_id: VALID_UUID,
      notes: 'A'.repeat(501),
    })
    expect(result.success).toBe(false)
  })
})