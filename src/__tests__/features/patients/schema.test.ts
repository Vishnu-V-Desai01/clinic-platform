/**
 * Tests for src/features/patients/schema.ts
 * Pure Zod schema validation - no mocking needed.
 *
 * Pattern: start from a known-valid input, override one field per test,
 * and check either the parsed output or the specific error message.
 * Messages are checked because actions.ts surfaces error.issues[0]?.message
 * directly to the caller - a changed message is a user-facing change.
 */

import { patientFormSchema, type PatientFormInput } from '../../../features/patients/schema'

const validInput: PatientFormInput = {
  firstName: 'Asha',
  lastName: 'Rao',
  dateOfBirth: '1990-05-15',
  gender: 'female',
  bloodGroup: 'O+',
  status: 'active',
  assignedDoctorId: '',
  phone: '9876543210',
  email: 'asha@example.com',
  addressLine: '123 MG Road',
  city: 'Bengaluru',
  state: 'Karnataka',
  pincode: '560001',
  languagePreference: 'en',
  emergencyName: 'Ravi Rao',
  emergencyRelationship: 'Spouse',
  emergencyPhone: '9123456780',
  allergies: ['Penicillin'],
  conditions: [],
  notes: '',
}

function parse(overrides: Partial<PatientFormInput> = {}) {
  return patientFormSchema.safeParse({ ...validInput, ...overrides })
}

function expectMessage(result: ReturnType<typeof parse>, message: string) {
  expect(result.success).toBe(false)
  if (!result.success) {
    expect(result.error.issues.some((issue) => issue.message === message)).toBe(true)
  }
}

describe('patientFormSchema', () => {
  it('accepts a fully valid submission', () => {
    const result = parse()
    expect(result.success).toBe(true)
  })

  describe('firstName / lastName', () => {
    it('trims surrounding whitespace', () => {
      const result = parse({ firstName: '  Asha  ' })
      expect(result.success).toBe(true)
      if (result.success) expect(result.data.firstName).toBe('Asha')
    })

    it('rejects an empty first name', () => {
      expectMessage(parse({ firstName: '' }), 'First name is required')
    })

    it('rejects a whitespace-only first name (trimmed before the length check)', () => {
      expectMessage(parse({ firstName: '   ' }), 'First name is required')
    })

    it('rejects an empty last name', () => {
      expectMessage(parse({ lastName: '' }), 'Last name is required')
    })

    it('rejects a first name over 255 characters', () => {
      // No custom message here, unlike optionalText()'s fields - firstName
      // uses a bare .max(255) with no message argument, so this falls
      // through to Zod's own default wording rather than an app-authored
      // one. Checking success=false (not a specific message) avoids the
      // test breaking on an unrelated Zod wording change.
      const result = parse({ firstName: 'A'.repeat(256) })
      expect(result.success).toBe(false)
    })
  })

  describe('dateOfBirth', () => {
    it('treats an empty string as not provided (null)', () => {
      const result = parse({ dateOfBirth: '' })
      expect(result.success).toBe(true)
      if (result.success) expect(result.data.dateOfBirth).toBeNull()
    })

    it('rejects an unparseable date', () => {
      expectMessage(parse({ dateOfBirth: 'not-a-date' }), 'Enter a valid date')
    })

    it('rejects a date before 1900', () => {
      expectMessage(parse({ dateOfBirth: '1899-12-31' }), 'Enter a valid date')
    })

    it('rejects a future date', () => {
      const future = new Date()
      future.setFullYear(future.getFullYear() + 1)
      const result = parse({ dateOfBirth: future.toISOString().split('T')[0] })
      expectMessage(result, "Date of birth can't be in the future")
    })

    it('accepts today as a valid date of birth', () => {
      const today = new Date().toISOString().split('T')[0]
      const result = parse({ dateOfBirth: today })
      expect(result.success).toBe(true)
    })
  })

  describe('gender', () => {
    it.each(['male', 'female', 'other', 'prefer_not_to_say'])('accepts %s', (value) => {
      const result = parse({ gender: value })
      expect(result.success).toBe(true)
    })

    it('rejects an invalid value', () => {
      expectMessage(parse({ gender: 'unspecified' }), 'Please select a gender')
    })

    it('rejects an empty value', () => {
      expectMessage(parse({ gender: '' }), 'Please select a gender')
    })
  })

  describe('bloodGroup', () => {
    it('accepts a valid blood group', () => {
      const result = parse({ bloodGroup: 'AB-' })
      expect(result.success).toBe(true)
      if (result.success) expect(result.data.bloodGroup).toBe('AB-')
    })

    it('treats an empty string as "not provided" (null), not an error', () => {
      const result = parse({ bloodGroup: '' })
      expect(result.success).toBe(true)
      if (result.success) expect(result.data.bloodGroup).toBeNull()
    })

    it('rejects an invalid blood group', () => {
      expectMessage(parse({ bloodGroup: 'X+' }), 'Invalid blood group')
    })
  })

  describe('status', () => {
    it('defaults to "active" when omitted', () => {
      const { status, ...withoutStatus } = validInput
      const result = patientFormSchema.safeParse(withoutStatus)
      expect(result.success).toBe(true)
      if (result.success) expect(result.data.status).toBe('active')
    })

    it('accepts an explicit valid status', () => {
      const result = parse({ status: 'inactive' })
      expect(result.success).toBe(true)
      if (result.success) expect(result.data.status).toBe('inactive')
    })

    it('rejects an invalid status', () => {
      expectMessage(parse({ status: 'deceased' }), 'Invalid status')
    })
  })

  describe('assignedDoctorId', () => {
    it('treats an empty string as unset (null) - shape-only, not requiredness', () => {
      const result = parse({ assignedDoctorId: '' })
      expect(result.success).toBe(true)
      if (result.success) expect(result.data.assignedDoctorId).toBeNull()
    })

    it('accepts a valid uuid', () => {
      // Not the usual all-1s placeholder: zod v4's .uuid() enforces the
      // RFC 4122 variant nibble, which an all-1s string doesn't satisfy.
      const uuid = '874ad51a-b42d-4ac8-b988-55ac10645308'
      const result = parse({ assignedDoctorId: uuid })
      expect(result.success).toBe(true)
      if (result.success) expect(result.data.assignedDoctorId).toBe(uuid)
    })

    it('rejects a non-uuid, non-empty value', () => {
      expectMessage(parse({ assignedDoctorId: 'not-a-uuid' }), 'Invalid doctor selection')
    })
  })

  describe('phone (required)', () => {
    it('accepts a valid 10-digit mobile number', () => {
      const result = parse({ phone: '9876543210' })
      expect(result.success).toBe(true)
      if (result.success) expect(result.data.phone).toBe('9876543210')
    })

    it('strips formatting characters before validating', () => {
      const result = parse({ phone: '98765-43210' })
      expect(result.success).toBe(true)
      if (result.success) expect(result.data.phone).toBe('9876543210')
    })

    // Documenting current behavior, not asserting it's the ideal UX: a
    // +91 country code pushes the digit-only string to 12 digits, which
    // fails the strict 10-digit check. Worth knowing if country-code
    // input is something clinics actually paste in.
    it('rejects a number with a +91 country code prefix (12 digits after stripping)', () => {
      const result = parse({ phone: '+91 98765 43210' })
      expect(result.success).toBe(false)
    })

    it('rejects a number not starting with 6-9', () => {
      expectMessage(parse({ phone: '0123456789' }), 'Enter a valid 10-digit mobile number')
    })

    it('rejects a too-short number', () => {
      expectMessage(parse({ phone: '12345' }), 'Enter a valid 10-digit mobile number')
    })

    it('rejects an 11-digit number (correct leading digit, one digit too many)', () => {
      expectMessage(parse({ phone: '98765432101' }), 'Enter a valid 10-digit mobile number')
    })

    it('rejects an empty phone number (required field)', () => {
      expectMessage(parse({ phone: '' }), 'Enter a valid 10-digit mobile number')
    })
  })

  describe('email', () => {
    it('accepts a valid email', () => {
      const result = parse({ email: 'test@example.com' })
      expect(result.success).toBe(true)
    })

    it('treats an empty string as not provided (null)', () => {
      const result = parse({ email: '' })
      expect(result.success).toBe(true)
      if (result.success) expect(result.data.email).toBeNull()
    })

    it('rejects an invalid email format', () => {
      expectMessage(parse({ email: 'not-an-email' }), 'Enter a valid email address')
    })
  })

  describe('addressLine / city / state (optional text)', () => {
    it('treats empty strings as null for all three', () => {
      const result = parse({ addressLine: '', city: '', state: '' })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.addressLine).toBeNull()
        expect(result.data.city).toBeNull()
        expect(result.data.state).toBeNull()
      }
    })

    it('rejects an address line over 1000 characters', () => {
      expectMessage(
        parse({ addressLine: 'A'.repeat(1001) }),
        'Must be 1000 characters or fewer',
      )
    })

    it('rejects a city over 100 characters', () => {
      expectMessage(parse({ city: 'A'.repeat(101) }), 'Must be 100 characters or fewer')
    })
  })

  describe('pincode', () => {
    it('accepts a valid 6-digit pincode', () => {
      const result = parse({ pincode: '560001' })
      expect(result.success).toBe(true)
    })

    it('treats an empty string as not provided (null)', () => {
      const result = parse({ pincode: '' })
      expect(result.success).toBe(true)
      if (result.success) expect(result.data.pincode).toBeNull()
    })

    it('rejects a 5-digit pincode', () => {
      expectMessage(parse({ pincode: '56001' }), 'Pincode must be 6 digits')
    })

    it('rejects a non-numeric pincode', () => {
      expectMessage(parse({ pincode: 'ABCDEF' }), 'Pincode must be 6 digits')
    })
  })

  describe('languagePreference', () => {
    it('defaults to "en" when omitted', () => {
      const { languagePreference, ...withoutLanguage } = validInput
      const result = patientFormSchema.safeParse(withoutLanguage)
      expect(result.success).toBe(true)
      if (result.success) expect(result.data.languagePreference).toBe('en')
    })

    it.each(['kn', 'en', 'hi', 'ta', 'gu'])('accepts %s', (value) => {
      const result = parse({ languagePreference: value })
      expect(result.success).toBe(true)
    })

    it('rejects an unsupported language', () => {
      expectMessage(parse({ languagePreference: 'fr' }), 'Invalid language')
    })
  })

  describe('emergencyPhone (optional)', () => {
    it('accepts a valid 10-digit number', () => {
      const result = parse({ emergencyPhone: '9123456780' })
      expect(result.success).toBe(true)
    })

    it('treats an empty string as not provided (null), unlike the required phone field', () => {
      const result = parse({ emergencyPhone: '' })
      expect(result.success).toBe(true)
      if (result.success) expect(result.data.emergencyPhone).toBeNull()
    })

    it('rejects an invalid non-empty number', () => {
      expectMessage(parse({ emergencyPhone: '123' }), 'Enter a valid 10-digit mobile number')
    })
  })

  describe('allergies / conditions (tag lists)', () => {
    it('defaults to an empty array when omitted', () => {
      const { allergies, conditions, ...withoutTags } = validInput
      const result = patientFormSchema.safeParse(withoutTags)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.allergies).toEqual([])
        expect(result.data.conditions).toEqual([])
      }
    })

    it('accepts a normal list of tags', () => {
      const result = parse({ allergies: ['Penicillin', 'Peanuts'] })
      expect(result.success).toBe(true)
    })

    it('rejects a blank entry in the list', () => {
      const result = parse({ allergies: ['Penicillin', ''] })
      expect(result.success).toBe(false)
    })

    it('rejects an entry over 100 characters', () => {
      const result = parse({ conditions: ['A'.repeat(101)] })
      expect(result.success).toBe(false)
    })

    it('rejects more than 50 entries', () => {
      const result = parse({ allergies: Array.from({ length: 51 }, (_, i) => `Item ${i}`) })
      expectMessage(result, 'Too many entries')
    })

    it('accepts exactly 50 entries', () => {
      const result = parse({ allergies: Array.from({ length: 50 }, (_, i) => `Item ${i}`) })
      expect(result.success).toBe(true)
    })
  })

  describe('notes', () => {
    it('treats an empty string as null', () => {
      const result = parse({ notes: '' })
      expect(result.success).toBe(true)
      if (result.success) expect(result.data.notes).toBeNull()
    })

    it('rejects notes over 5000 characters', () => {
      expectMessage(parse({ notes: 'A'.repeat(5001) }), 'Must be 5000 characters or fewer')
    })
  })
})