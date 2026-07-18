/**
 * Tests for src/features/appointments/schema.ts
 * Pure Zod validation - no mocking needed, except fake timers for the
 * "must be in the future" refinements, which compare against new Date()
 * at parse time.
 */

import {
  createAppointmentSchema,
  rescheduleAppointmentSchema,
  cancelAppointmentSchema,
  updateAppointmentStatusSchema,
} from '../../../features/appointments/schema'

const VALID_PATIENT_ID = '874ad51a-b42d-4ac8-b988-55ac10645308'
const VALID_DOCTOR_ID = '22222222-2222-4222-8222-222222222222'

// Fake "now" = 2026-07-15T10:00:00.000Z = 2026-07-15T15:30:00+05:30 (IST)
const NOW_UTC = '2026-07-15T10:00:00.000Z'

beforeEach(() => {
  jest.useFakeTimers()
  jest.setSystemTime(new Date(NOW_UTC))
})

afterEach(() => {
  jest.useRealTimers()
})

const validCreateInput = {
  patientId: VALID_PATIENT_ID,
  doctorId: VALID_DOCTOR_ID,
  appointmentDate: '2026-07-16',
  appointmentTime: '10:00',
  durationMinutes: 30,
  chiefComplaint: 'Follow-up visit',
}

describe('createAppointmentSchema', () => {
  it('accepts a fully valid submission', () => {
    const result = createAppointmentSchema.safeParse(validCreateInput)
    expect(result.success).toBe(true)
  })

  it('rejects a non-uuid patientId', () => {
    const result = createAppointmentSchema.safeParse({ ...validCreateInput, patientId: 'nope' })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues.some((i) => i.message === 'Invalid patient')).toBe(true)
  })

  it('rejects a non-uuid doctorId', () => {
    const result = createAppointmentSchema.safeParse({ ...validCreateInput, doctorId: 'nope' })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues.some((i) => i.message === 'Invalid doctor')).toBe(true)
  })

  it('rejects an empty date', () => {
    const result = createAppointmentSchema.safeParse({ ...validCreateInput, appointmentDate: '' })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues.some((i) => i.message === 'Date is required')).toBe(true)
  })

  it('rejects an unparseable date', () => {
    const result = createAppointmentSchema.safeParse({ ...validCreateInput, appointmentDate: 'not-a-date' })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues.some((i) => i.message === 'Invalid date')).toBe(true)
  })

  it('rejects an empty time', () => {
    const result = createAppointmentSchema.safeParse({ ...validCreateInput, appointmentTime: '' })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues.some((i) => i.message === 'Time is required')).toBe(true)
  })

  it('rejects a time not in HH:MM format', () => {
    const result = createAppointmentSchema.safeParse({ ...validCreateInput, appointmentTime: '10am' })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues.some((i) => i.message === 'Time must be HH:MM')).toBe(true)
  })

  it('rejects a duration under 15 minutes', () => {
    const result = createAppointmentSchema.safeParse({ ...validCreateInput, durationMinutes: 10 })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message === 'Minimum duration is 15 minutes')).toBe(true)
    }
  })

  it('rejects a duration over 480 minutes', () => {
    const result = createAppointmentSchema.safeParse({ ...validCreateInput, durationMinutes: 481 })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message === 'Maximum duration is 8 hours')).toBe(true)
    }
  })

  it('rejects a non-integer duration', () => {
    const result = createAppointmentSchema.safeParse({ ...validCreateInput, durationMinutes: 15.5 })
    expect(result.success).toBe(false)
  })

  it('treats an empty chief complaint as null', () => {
    const result = createAppointmentSchema.safeParse({ ...validCreateInput, chiefComplaint: '' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.chiefComplaint).toBeNull()
  })

  it('rejects a chief complaint over 1000 characters', () => {
    const result = createAppointmentSchema.safeParse({
      ...validCreateInput,
      chiefComplaint: 'A'.repeat(1001),
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(
        result.error.issues.some((i) => i.message === 'Chief complaint must be 1000 characters or fewer'),
      ).toBe(true)
    }
  })

  it('rejects a date/time combination in the past', () => {
    const result = createAppointmentSchema.safeParse({
      ...validCreateInput,
      appointmentDate: '2026-07-14',
      appointmentTime: '10:00',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.message === 'Appointment must be scheduled in the future')
      expect(issue).toBeDefined()
      expect(issue?.path).toEqual(['appointmentDate'])
    }
  })

  it('rejects a date/time combination exactly equal to "now" (strictly-future check)', () => {
    // Fake "now" is 2026-07-15T15:30:00+05:30 exactly.
    const result = createAppointmentSchema.safeParse({
      ...validCreateInput,
      appointmentDate: '2026-07-15',
      appointmentTime: '15:30',
    })
    expect(result.success).toBe(false)
  })

  it('accepts a date/time one minute after "now"', () => {
    const result = createAppointmentSchema.safeParse({
      ...validCreateInput,
      appointmentDate: '2026-07-15',
      appointmentTime: '15:31',
    })
    expect(result.success).toBe(true)
  })
})

describe('rescheduleAppointmentSchema', () => {
  const validReschedule = { appointmentDate: '2026-07-16', appointmentTime: '10:00', durationMinutes: 30 }

  it('accepts a valid future submission', () => {
    const result = rescheduleAppointmentSchema.safeParse(validReschedule)
    expect(result.success).toBe(true)
  })

  it('rejects a past date/time with its own message', () => {
    const result = rescheduleAppointmentSchema.safeParse({
      ...validReschedule,
      appointmentDate: '2026-07-14',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message === 'New appointment must be in the future')).toBe(true)
    }
  })

  it('rejects a duration outside the 15-480 range', () => {
    const result = rescheduleAppointmentSchema.safeParse({ ...validReschedule, durationMinutes: 5 })
    expect(result.success).toBe(false)
  })
})

describe('cancelAppointmentSchema', () => {
  it('accepts a submission with a reason', () => {
    const result = cancelAppointmentSchema.safeParse({ reason: 'Patient rescheduled elsewhere' })
    expect(result.success).toBe(true)
  })

  it('accepts reason omitted entirely', () => {
    const result = cancelAppointmentSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it('treats an empty reason as null', () => {
    const result = cancelAppointmentSchema.safeParse({ reason: '' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.reason).toBeNull()
  })

  it('rejects a reason over 500 characters', () => {
    const result = cancelAppointmentSchema.safeParse({ reason: 'A'.repeat(501) })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message === 'Reason must be 500 characters or fewer')).toBe(true)
    }
  })
})

describe('updateAppointmentStatusSchema', () => {
  it.each(['scheduled', 'completed', 'cancelled', 'no_show'])('accepts %s as a valid status', (status) => {
    const result = updateAppointmentStatusSchema.safeParse({ status })
    expect(result.success).toBe(true)
  })

  it('rejects a status outside the known set', () => {
    const result = updateAppointmentStatusSchema.safeParse({ status: 'rescheduled' })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues.some((i) => i.message === 'Invalid status')).toBe(true)
  })

  it('accepts doctorNotes omitted', () => {
    const result = updateAppointmentStatusSchema.safeParse({ status: 'completed' })
    expect(result.success).toBe(true)
  })

  it('treats empty doctorNotes as null', () => {
    const result = updateAppointmentStatusSchema.safeParse({ status: 'completed', doctorNotes: '' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.doctorNotes).toBeNull()
  })

  it('rejects doctorNotes over 5000 characters', () => {
    const result = updateAppointmentStatusSchema.safeParse({
      status: 'completed',
      doctorNotes: 'A'.repeat(5001),
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message === 'Notes must be 5000 characters or fewer')).toBe(true)
    }
  })
})