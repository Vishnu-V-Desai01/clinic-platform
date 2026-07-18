/**
 * Tests for src/features/appointments/actions.ts
 * Step 5b covered: listDoctors, listAppointments, getAppointmentById,
 * cancelAppointment, updateAppointmentStatus.
 * Step 5c (this addition) covers: createAppointment, rescheduleAppointment
 * - the conflict-prevention core, including a precise, TZ-controlled look
 * at checkDoubleBooking's day-window calculation.
 *
 * requireRole is mocked as an already-trusted boundary. Supabase is
 * mocked entirely: these tests verify this file's own logic, not RLS
 * or real Postgres behavior.
 */

jest.mock('@/lib/supabase/profile', () => ({
  requireRole: jest.fn(),
}))

jest.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: jest.fn(),
}))

jest.mock('@/features/messaging/actions', () => ({
  createAppointmentMessage: jest.fn(),
}))

import { requireRole } from '@/lib/supabase/profile'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAppointmentMessage } from '@/features/messaging/actions'
import {
  listDoctors,
  listAppointments,
  getAppointmentById,
  createAppointment,
  rescheduleAppointment,
  cancelAppointment,
  updateAppointmentStatus,
} from '../../../features/appointments/actions'

// Builds one chainable/awaitable fake query result.
function makeChain(result: { data: any; error: any }) {
  const chain: any = {}
  const methods = ['select', 'eq', 'is', 'in', 'order', 'update', 'insert', 'upsert', 'gte', 'lte']
  for (const m of methods) chain[m] = jest.fn(() => chain)
  chain.single = jest.fn(() => Promise.resolve(result))
  chain.maybeSingle = jest.fn(() => Promise.resolve(result))
  chain.then = (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject)
  return chain
}

// Some functions here make multiple sequential supabase.from(...) calls
// with different expected results (e.g. fetch-then-update). This queues
// up a distinct chain per call, in order.
function makeSupabaseClient(...results: { data: any; error: any }[]) {
  const chains = results.map(makeChain)
  const from = jest.fn()
  chains.forEach((chain) => from.mockReturnValueOnce(chain))
  return { from, chains }
}

function makeProfile(overrides: { id?: string; clinic_id?: string | null; role?: string } = {}): any {
  return {
    id: overrides.id ?? 'doctor-1',
    // clinic_id uses `in` rather than `??` on purpose: `??` can't tell
    // "not provided" from "explicitly null", and the null-clinic_id
    // guard test below relies on passing null explicitly.
    clinic_id: 'clinic_id' in overrides ? overrides.clinic_id : 'clinic-a',
    role: overrides.role ?? 'doctor',
    clerk_user_id: 'clerk-1',
    email: 'doc@test.clinic',
    full_name: 'Dr Test',
  }
}

const VALID_PATIENT_ID = '874ad51a-b42d-4ac8-b988-55ac10645308'
const VALID_DOCTOR_ID = '22222222-2222-4222-8222-222222222222'

describe('listDoctors', () => {
  it('returns doctors in this clinic, ordered by name, mapped to the option shape', async () => {
    jest.mocked(requireRole).mockResolvedValue(makeProfile({ clinic_id: 'clinic-a' }))
    const rows = [
      { id: 'd1', full_name: 'Dr Asha Rao', specialization: 'Cardiology' },
      { id: 'd2', full_name: null, specialization: null },
    ]
    const { from, chains } = makeSupabaseClient({ data: rows, error: null })
    jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)

    const result = await listDoctors()

    expect(result).toEqual({
      success: true,
      data: [
        { id: 'd1', fullName: 'Dr Asha Rao', specialization: 'Cardiology' },
        { id: 'd2', fullName: 'Unknown Doctor', specialization: null },
      ],
    })
    expect(chains[0].eq).toHaveBeenCalledWith('clinic_id', 'clinic-a')
    expect(chains[0].eq).toHaveBeenCalledWith('role', 'doctor')
    expect(chains[0].order).toHaveBeenCalledWith('full_name')
  })

  it('returns a generic failure when the query errors', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    jest.mocked(requireRole).mockResolvedValue(makeProfile())
    const { from } = makeSupabaseClient({ data: null, error: { message: 'db down' } })
    jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)

    const result = await listDoctors()

    expect(result).toEqual({ success: false, error: 'Failed to load doctors.' })
    consoleErrorSpy.mockRestore()
  })

  it('propagates an unauthorized-caller redirect uncaught (confirms the FIX comment holds)', async () => {
    jest.mocked(requireRole).mockRejectedValue(new Error('NEXT_REDIRECT:/'))

    await expect(listDoctors()).rejects.toThrow('NEXT_REDIRECT:/')
    expect(createServerSupabaseClient).not.toHaveBeenCalled()
  })
})

describe('listAppointments', () => {
  const joinedRow = {
    id: 'a1',
    appointment_date: '2026-07-16T09:00:00+05:30',
    duration_minutes: 30,
    status: 'scheduled',
    chief_complaint: 'Fever',
    patient_id: 'p1',
    doctor_id: 'd1',
    patients: { first_name: 'Asha', last_name: 'Rao', patient_id_number: 'CLI-2026-000001' },
    profiles: { full_name: 'Dr Kumar', specialization: 'General' },
  }

  it('FIXED: rejects with no DB call when the caller profile has no clinic_id', async () => {
    jest.mocked(requireRole).mockResolvedValue(makeProfile({ clinic_id: null }))

    const result = await listAppointments()

    expect(result).toEqual({ success: false, error: 'Your account is not associated with a clinic.' })
    expect(createServerSupabaseClient).not.toHaveBeenCalled()
  })

  it('maps a joined row to the list item shape, including formatted date/time', async () => {
    jest.mocked(requireRole).mockResolvedValue(makeProfile({ clinic_id: 'clinic-a' }))
    const { from, chains } = makeSupabaseClient({ data: [joinedRow], error: null })
    jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)

    const result = await listAppointments()

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual([
        {
          id: 'a1',
          patientName: 'Asha Rao',
          patientMrn: 'CLI-2026-000001',
          doctorName: 'Dr Kumar',
          appointmentDate: '2026-07-16',
          appointmentTime: '09:00',
          durationMinutes: 30,
          status: 'scheduled',
          chiefComplaint: 'Fever',
        },
      ])
    }
    expect(chains[0].eq).toHaveBeenCalledWith('clinic_id', 'clinic-a')
    expect(chains[0].is).toHaveBeenCalledWith('deleted_at', null)
  })

  it('falls back to em dashes for a missing patient/doctor join, but leaves mrn as null (not em dash)', async () => {
    jest.mocked(requireRole).mockResolvedValue(makeProfile())
    const rowWithNoJoins = { ...joinedRow, patients: null, profiles: null }
    const { from } = makeSupabaseClient({ data: [rowWithNoJoins], error: null })
    jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)

    const result = await listAppointments()

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data[0].patientName).toBe('— —')
      expect(result.data[0].doctorName).toBe('—')
      expect(result.data[0].patientMrn).toBeNull()
    }
  })

  it('applies each optional filter only when provided', async () => {
    jest.mocked(requireRole).mockResolvedValue(makeProfile())
    const { from, chains } = makeSupabaseClient({ data: [], error: null })
    jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)

    await listAppointments({ patientId: 'p1', status: 'scheduled' })

    expect(chains[0].eq).toHaveBeenCalledWith('patient_id', 'p1')
    expect(chains[0].eq).toHaveBeenCalledWith('status', 'scheduled')
    expect(chains[0].eq).not.toHaveBeenCalledWith('doctor_id', expect.anything())
    expect(chains[0].gte).not.toHaveBeenCalled()
    expect(chains[0].lte).not.toHaveBeenCalled()
  })

  it('applies dateFrom/dateTo as IST-anchored day boundaries when provided', async () => {
    jest.mocked(requireRole).mockResolvedValue(makeProfile())
    const { from, chains } = makeSupabaseClient({ data: [], error: null })
    jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)

    await listAppointments({ dateFrom: '2026-07-01', dateTo: '2026-07-31' })

    expect(chains[0].gte).toHaveBeenCalledWith('appointment_date', '2026-07-01T00:00:00+05:30')
    expect(chains[0].lte).toHaveBeenCalledWith('appointment_date', '2026-07-31T23:59:59+05:30')
  })

  it('returns a generic failure when the query errors', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    jest.mocked(requireRole).mockResolvedValue(makeProfile())
    const { from } = makeSupabaseClient({ data: null, error: { message: 'db down' } })
    jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)

    const result = await listAppointments()

    expect(result).toEqual({ success: false, error: 'Failed to load appointments.' })
    consoleErrorSpy.mockRestore()
  })
})

describe('getAppointmentById', () => {
  const detailRow = {
    id: 'a1',
    clinic_id: 'clinic-a',
    patient_id: 'p1',
    doctor_id: 'd1',
    appointment_date: '2026-07-16T09:00:00+05:30',
    duration_minutes: 30,
    status: 'scheduled',
    chief_complaint: 'Fever',
    doctor_notes: null,
    cancellation_reason: null,
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
    patients: { first_name: 'Asha', last_name: 'Rao', patient_id_number: 'CLI-2026-000001' },
    profiles: { full_name: 'Dr Kumar', specialization: 'General' },
  }

  it('returns the detail shape scoped to id + clinic + not-deleted', async () => {
    jest.mocked(requireRole).mockResolvedValue(makeProfile({ clinic_id: 'clinic-a' }))
    const { from, chains } = makeSupabaseClient({ data: detailRow, error: null })
    jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)

    const result = await getAppointmentById('a1')

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.patientName).toBe('Asha Rao')
      expect(result.data.doctorName).toBe('Dr Kumar')
      expect(result.data.appointmentDate).toBe('2026-07-16')
      expect(result.data.appointmentTime).toBe('09:00')
    }
    expect(chains[0].eq).toHaveBeenCalledWith('id', 'a1')
    expect(chains[0].eq).toHaveBeenCalledWith('clinic_id', 'clinic-a')
    expect(chains[0].is).toHaveBeenCalledWith('deleted_at', null)
  })

  it('returns "Appointment not found" when the query succeeds with no matching row', async () => {
    jest.mocked(requireRole).mockResolvedValue(makeProfile())
    const { from } = makeSupabaseClient({ data: null, error: null })
    jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)

    const result = await getAppointmentById('missing-id')

    expect(result).toEqual({ success: false, error: 'Appointment not found.' })
  })

  it('returns a generic failure when the query errors', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    jest.mocked(requireRole).mockResolvedValue(makeProfile())
    const { from } = makeSupabaseClient({ data: null, error: { message: 'db down' } })
    jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)

    const result = await getAppointmentById('a1')

    expect(result).toEqual({ success: false, error: 'Failed to load appointment.' })
    consoleErrorSpy.mockRestore()
  })
})

describe('cancelAppointment', () => {
  it('cancels a scheduled appointment with no input (reason omitted)', async () => {
    jest.mocked(requireRole).mockResolvedValue(makeProfile({ clinic_id: 'clinic-a' }))
    const { from, chains } = makeSupabaseClient(
      { data: { status: 'scheduled' }, error: null }, // fetch
      { data: null, error: null }, // update
    )
    jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)

    const result = await cancelAppointment('a1')

    expect(result).toEqual({ success: true, data: undefined })
    expect(chains[1].update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'cancelled', cancellation_reason: null }),
    )
  })

  it('includes the provided reason in the update', async () => {
    jest.mocked(requireRole).mockResolvedValue(makeProfile())
    const { from, chains } = makeSupabaseClient(
      { data: { status: 'scheduled' }, error: null },
      { data: null, error: null },
    )
    jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)

    await cancelAppointment('a1', { reason: 'Patient requested' })

    expect(chains[1].update).toHaveBeenCalledWith(
      expect.objectContaining({ cancellation_reason: 'Patient requested' }),
    )
  })

  it('a no_show appointment CAN be cancelled (only cancelled/completed are blocked)', async () => {
    jest.mocked(requireRole).mockResolvedValue(makeProfile())
    const { from } = makeSupabaseClient(
      { data: { status: 'no_show' }, error: null },
      { data: null, error: null },
    )
    jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)

    const result = await cancelAppointment('a1')

    expect(result).toEqual({ success: true, data: undefined })
  })

  it('rejects re-cancelling an already-cancelled appointment, with no update call', async () => {
    jest.mocked(requireRole).mockResolvedValue(makeProfile())
    const { from, chains } = makeSupabaseClient({ data: { status: 'cancelled' }, error: null })
    jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)

    const result = await cancelAppointment('a1')

    expect(result).toEqual({ success: false, error: 'This appointment is already cancelled.' })
    expect(from).toHaveBeenCalledTimes(1) // only the fetch, no update attempted
  })

  it('rejects cancelling a completed appointment', async () => {
    jest.mocked(requireRole).mockResolvedValue(makeProfile())
    const { from } = makeSupabaseClient({ data: { status: 'completed' }, error: null })
    jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)

    const result = await cancelAppointment('a1')

    expect(result).toEqual({ success: false, error: 'Completed appointments cannot be cancelled.' })
  })

  it('returns "Appointment not found" when the fetch matches no row', async () => {
    jest.mocked(requireRole).mockResolvedValue(makeProfile())
    const { from } = makeSupabaseClient({ data: null, error: null })
    jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)

    const result = await cancelAppointment('missing-id')

    expect(result).toEqual({ success: false, error: 'Appointment not found.' })
  })

  it('rejects invalid input with the schema error, before even fetching the appointment', async () => {
    jest.mocked(requireRole).mockResolvedValue(makeProfile())

    const result = await cancelAppointment('a1', { reason: 'A'.repeat(501) })

    expect(result).toEqual({ success: false, error: 'Reason must be 500 characters or fewer' })
    expect(createServerSupabaseClient).not.toHaveBeenCalled()
  })
})

describe('updateAppointmentStatus', () => {
  it('requires doctor only, not staff (confirms the role wiring, distinct from every other function here)', async () => {
    jest.mocked(requireRole).mockResolvedValue(makeProfile({ role: 'doctor' }))
    const { from } = makeSupabaseClient(
      { data: { status: 'scheduled' }, error: null },
      { data: { id: 'a1', status: 'completed' }, error: null },
    )
    jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)

    await updateAppointmentStatus('a1', { status: 'completed' })

    expect(requireRole).toHaveBeenCalledWith('doctor')
    expect(requireRole).not.toHaveBeenCalledWith('doctor', 'staff')
  })

  it('updates status and doctor notes, scoped to id + clinic', async () => {
    jest.mocked(requireRole).mockResolvedValue(makeProfile({ clinic_id: 'clinic-a' }))
    const updated = { id: 'a1', status: 'completed' }
    const { from, chains } = makeSupabaseClient(
      { data: { status: 'scheduled' }, error: null },
      { data: updated, error: null },
    )
    jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)

    const result = await updateAppointmentStatus('a1', {
      status: 'completed',
      doctorNotes: 'Patient recovering well',
    })

    expect(result).toEqual({ success: true, data: updated })
    expect(chains[1].update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'completed', doctor_notes: 'Patient recovering well' }),
    )
    expect(chains[1].eq).toHaveBeenCalledWith('id', 'a1')
    expect(chains[1].eq).toHaveBeenCalledWith('clinic_id', 'clinic-a')
  })

  it('rejects updating a cancelled appointment', async () => {
    jest.mocked(requireRole).mockResolvedValue(makeProfile())
    const { from } = makeSupabaseClient({ data: { status: 'cancelled' }, error: null })
    jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)

    const result = await updateAppointmentStatus('a1', { status: 'completed' })

    expect(result).toEqual({ success: false, error: 'Cancelled appointments cannot be updated.' })
  })

  it('returns "Appointment not found" when the fetch matches no row', async () => {
    jest.mocked(requireRole).mockResolvedValue(makeProfile())
    const { from } = makeSupabaseClient({ data: null, error: null })
    jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)

    const result = await updateAppointmentStatus('missing-id', { status: 'completed' })

    expect(result).toEqual({ success: false, error: 'Appointment not found.' })
  })

  it('rejects an invalid status with the schema error', async () => {
    jest.mocked(requireRole).mockResolvedValue(makeProfile())

    const result = await updateAppointmentStatus('a1', { status: 'rescheduled' })

    expect(result).toEqual({ success: false, error: 'Invalid status' })
    expect(createServerSupabaseClient).not.toHaveBeenCalled()
  })
})

describe('createAppointment', () => {
  const validInput = {
    patientId: VALID_PATIENT_ID,
    doctorId: VALID_DOCTOR_ID,
    appointmentDate: '2026-07-20',
    appointmentTime: '10:00',
    durationMinutes: 30,
    chiefComplaint: 'Follow-up visit',
  }

  beforeEach(() => {
    jest.useFakeTimers()
    // Well before any date used in these tests, so the schema's
    // future-date refinement always passes.
    jest.setSystemTime(new Date('2026-07-01T00:00:00.000Z'))
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('propagates an unauthorized-caller redirect uncaught', async () => {
    jest.mocked(requireRole).mockRejectedValue(new Error('NEXT_REDIRECT:/'))

    await expect(createAppointment(validInput)).rejects.toThrow('NEXT_REDIRECT:/')
    expect(createServerSupabaseClient).not.toHaveBeenCalled()
  })

  it('rejects invalid input with the schema error, before touching the database', async () => {
    jest.mocked(requireRole).mockResolvedValue(makeProfile())

    const result = await createAppointment({ ...validInput, durationMinutes: 5 })

    expect(result).toEqual({ success: false, error: 'Minimum duration is 15 minutes' })
    expect(createServerSupabaseClient).not.toHaveBeenCalled()
  })

  it('confirms checkDoubleBooking queries scoped to this doctor and only "scheduled" appointments', async () => {
    jest.mocked(requireRole).mockResolvedValue(makeProfile())
    const { from, chains } = makeSupabaseClient(
      { data: [], error: null },
      { data: { id: 'new-appt' }, error: null },
    )
    jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)

    await createAppointment(validInput)

    expect(chains[0].eq).toHaveBeenCalledWith('doctor_id', VALID_DOCTOR_ID)
    expect(chains[0].eq).toHaveBeenCalledWith('status', 'scheduled')
    expect(chains[0].is).toHaveBeenCalledWith('deleted_at', null)
  })

  describe('overlap detection (proposed slot: 10:00-10:30 IST)', () => {
    // Each existing appointment below is what checkDoubleBooking's query
    // would return - i.e. already filtered to this doctor + "scheduled"
    // status by Postgres in reality. These tests isolate the interval-
    // overlap math itself, independent of the query filters (covered
    // separately above).
    async function conflictFor(existing: { appointment_date: string; duration_minutes: number }) {
      jest.mocked(requireRole).mockResolvedValue(makeProfile())
      const { from } = makeSupabaseClient(
        { data: [{ id: 'existing-1', ...existing }], error: null },
        { data: { id: 'new-appt' }, error: null },
      )
      jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)
      return createAppointment(validInput)
    }

    it('no conflict when the existing appointment ends before the new one starts', async () => {
      const result = await conflictFor({ appointment_date: '2026-07-20T09:00:00+05:30', duration_minutes: 30 })
      expect(result.success).toBe(true)
    })

    it('no conflict when the existing appointment ends exactly when the new one starts (back-to-back)', async () => {
      const result = await conflictFor({ appointment_date: '2026-07-20T09:30:00+05:30', duration_minutes: 30 })
      expect(result.success).toBe(true)
    })

    it('conflict when the existing appointment overlaps into the new one\'s start', async () => {
      const result = await conflictFor({ appointment_date: '2026-07-20T09:45:00+05:30', duration_minutes: 30 })
      expect(result).toEqual({ success: false, error: 'That doctor already has an appointment at this time.' })
    })

    it('conflict when the existing appointment is the exact same slot', async () => {
      const result = await conflictFor({ appointment_date: '2026-07-20T10:00:00+05:30', duration_minutes: 30 })
      expect(result.success).toBe(false)
    })

    it('conflict when the existing appointment starts during the new one', async () => {
      const result = await conflictFor({ appointment_date: '2026-07-20T10:15:00+05:30', duration_minutes: 30 })
      expect(result.success).toBe(false)
    })

    it('no conflict when the existing appointment starts exactly when the new one ends (back-to-back)', async () => {
      const result = await conflictFor({ appointment_date: '2026-07-20T10:30:00+05:30', duration_minutes: 30 })
      expect(result.success).toBe(true)
    })

    it('conflict when the existing appointment fully contains the new one', async () => {
      const result = await conflictFor({ appointment_date: '2026-07-20T09:00:00+05:30', duration_minutes: 120 })
      expect(result.success).toBe(false)
    })

    it('conflict when the existing appointment is fully contained within the new one', async () => {
      const result = await conflictFor({ appointment_date: '2026-07-20T10:10:00+05:30', duration_minutes: 10 })
      expect(result.success).toBe(false)
    })

    it('ignores an existing appointment for a different day entirely', async () => {
      const result = await conflictFor({ appointment_date: '2026-07-21T10:00:00+05:30', duration_minutes: 30 })
      expect(result.success).toBe(true)
    })
  })

  describe('day-window timezone behavior (checkDoubleBooking)', () => {
    it('FIXED: the day-window is IST-anchored regardless of the server process\'s own timezone', async () => {
      // Previously this used .setHours(), which read the server process's
      // local timezone rather than IST - for this same input (1 AM IST),
      // that produced a window shifted a full day off the intended IST
      // calendar day when the process timezone was UTC (Vercel's default).
      // Now it's derived directly from the already-IST-anchored ISO string
      // combineDateAndTime() always produces, so it's correct regardless
      // of what timezone the server process itself runs in. This test
      // runs with process.env.TZ left as this sandbox's default (UTC) -
      // the fix no longer cares either way.
      jest.mocked(requireRole).mockResolvedValue(makeProfile())
      const { from, chains } = makeSupabaseClient(
        { data: [], error: null },
        { data: { id: 'new-appt' }, error: null },
      )
      jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)

      // 1 AM IST on the 20th - the exact boundary case from types.test.ts
      await createAppointment({ ...validInput, appointmentDate: '2026-07-20', appointmentTime: '01:00' })

      expect(chains[0].gte).toHaveBeenCalledWith('appointment_date', '2026-07-19T18:30:00.000Z')
      expect(chains[0].lte).toHaveBeenCalledWith('appointment_date', '2026-07-20T18:29:59.999Z')
    })

    it('a normal business-hours appointment still gets a correctly-bounded window', async () => {
      jest.mocked(requireRole).mockResolvedValue(makeProfile())
      const { from } = makeSupabaseClient(
        { data: [{ id: 'existing-1', appointment_date: '2026-07-20T10:00:00+05:30', duration_minutes: 30 }], error: null },
        { data: { id: 'new-appt' }, error: null },
      )
      jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)

      const result = await createAppointment({ ...validInput, appointmentTime: '10:15' })

      expect(result).toEqual({ success: false, error: 'That doctor already has an appointment at this time.' })
    })
  })

  it('creates the appointment with status "scheduled" on success', async () => {
    jest.mocked(requireRole).mockResolvedValue(makeProfile({ clinic_id: 'clinic-a' }))
    const created = { id: 'new-appt', status: 'scheduled' }
    const { from, chains } = makeSupabaseClient(
      { data: [], error: null },
      { data: created, error: null },
    )
    jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)

    const result = await createAppointment(validInput)

    expect(result).toEqual({ success: true, data: created })
    expect(chains[1].insert).toHaveBeenCalledWith(
      expect.objectContaining({
        clinic_id: 'clinic-a',
        patient_id: VALID_PATIENT_ID,
        doctor_id: VALID_DOCTOR_ID,
        status: 'scheduled',
      }),
    )
  })

  it('returns a generic failure when the insert errors', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    jest.mocked(requireRole).mockResolvedValue(makeProfile())
    const { from } = makeSupabaseClient(
      { data: [], error: null },
      { data: null, error: { message: 'insert failed' } },
    )
    jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)

    const result = await createAppointment(validInput)

    expect(result).toEqual({ success: false, error: 'Failed to create appointment.' })
    consoleErrorSpy.mockRestore()
  })

  describe('post-creation reminder message (via after-the-fact call, not after())', () => {
    // Unlike createPatient, this file does NOT use next/server's after() -
    // createAppointmentMessage is awaited directly inside a try/catch, so
    // it blocks the response (briefly) rather than being truly deferred.
    it('calls createAppointmentMessage with the new appointment id', async () => {
      jest.mocked(requireRole).mockResolvedValue(makeProfile())
      const created = { id: 'new-appt-1', status: 'scheduled' }
      const { from } = makeSupabaseClient(
        { data: [], error: null },
        { data: created, error: null },
      )
      jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)
      jest.mocked(createAppointmentMessage).mockResolvedValue({ success: true } as any)

      await createAppointment(validInput)

      expect(createAppointmentMessage).toHaveBeenCalledWith({ appointmentId: 'new-appt-1' })
    })

    it('a failure sending the reminder is caught and logged, not thrown - the appointment is still created', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
      jest.mocked(requireRole).mockResolvedValue(makeProfile())
      const created = { id: 'new-appt-2', status: 'scheduled' }
      const { from } = makeSupabaseClient(
        { data: [], error: null },
        { data: created, error: null },
      )
      jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)
      jest.mocked(createAppointmentMessage).mockRejectedValue(new Error('WhatsApp provider down'))

      const result = await createAppointment(validInput)

      expect(result).toEqual({ success: true, data: created })
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[createAppointment] Appointment message failed:',
        expect.any(Error),
      )
      consoleErrorSpy.mockRestore()
    })
  })
})

describe('rescheduleAppointment', () => {
  const validInput = {
    appointmentDate: '2026-07-20',
    appointmentTime: '14:00',
    durationMinutes: 30,
  }

  beforeEach(() => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2026-07-01T00:00:00.000Z'))
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('returns "Appointment not found" when the fetch matches no row', async () => {
    jest.mocked(requireRole).mockResolvedValue(makeProfile())
    const { from } = makeSupabaseClient({ data: null, error: null })
    jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)

    const result = await rescheduleAppointment('missing-id', validInput)

    expect(result).toEqual({ success: false, error: 'Appointment not found.' })
  })

  it('rejects rescheduling an appointment that is not currently scheduled', async () => {
    jest.mocked(requireRole).mockResolvedValue(makeProfile())
    const { from } = makeSupabaseClient({ data: { doctor_id: VALID_DOCTOR_ID, status: 'completed' }, error: null })
    jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)

    const result = await rescheduleAppointment('a1', validInput)

    expect(result).toEqual({ success: false, error: 'Only scheduled appointments can be rescheduled.' })
  })

  it('excludes the appointment being rescheduled from its own conflict check', async () => {
    // Rescheduling to the exact slot it is already in must not conflict
    // with itself - checkDoubleBooking is called with excludeId for
    // exactly this reason.
    jest.mocked(requireRole).mockResolvedValue(makeProfile())
    const { from } = makeSupabaseClient(
      { data: { doctor_id: VALID_DOCTOR_ID, status: 'scheduled' }, error: null },
      {
        data: [{ id: 'a1', appointment_date: '2026-07-20T14:00:00+05:30', duration_minutes: 30 }],
        error: null,
      },
      { data: { id: 'a1', status: 'scheduled' }, error: null },
    )
    jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)

    const result = await rescheduleAppointment('a1', validInput)

    expect(result.success).toBe(true)
  })

  it('still detects a genuine conflict with a DIFFERENT appointment when rescheduling', async () => {
    jest.mocked(requireRole).mockResolvedValue(makeProfile())
    const { from } = makeSupabaseClient(
      { data: { doctor_id: VALID_DOCTOR_ID, status: 'scheduled' }, error: null },
      {
        data: [
          { id: 'a1', appointment_date: '2026-07-20T09:00:00+05:30', duration_minutes: 30 }, // self, excluded
          { id: 'a2', appointment_date: '2026-07-20T14:00:00+05:30', duration_minutes: 30 }, // a different appointment
        ],
        error: null,
      },
    )
    jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)

    // Rescheduling 'a1' to overlap with 'a2'
    const result = await rescheduleAppointment('a1', validInput)

    expect(result).toEqual({ success: false, error: 'That doctor already has an appointment at this time.' })
  })

  it('updates the appointment on success, scoped to id + clinic', async () => {
    jest.mocked(requireRole).mockResolvedValue(makeProfile({ clinic_id: 'clinic-a' }))
    const updated = { id: 'a1', status: 'scheduled' }
    const { from, chains } = makeSupabaseClient(
      { data: { doctor_id: VALID_DOCTOR_ID, status: 'scheduled' }, error: null },
      { data: [], error: null },
      { data: updated, error: null },
    )
    jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)

    const result = await rescheduleAppointment('a1', validInput)

    expect(result).toEqual({ success: true, data: updated })
    expect(chains[2].eq).toHaveBeenCalledWith('id', 'a1')
    expect(chains[2].eq).toHaveBeenCalledWith('clinic_id', 'clinic-a')
  })

  it('rejects invalid input with the schema error, before any database call', async () => {
    jest.mocked(requireRole).mockResolvedValue(makeProfile())

    const result = await rescheduleAppointment('a1', { ...validInput, durationMinutes: 5 })

    expect(result).toEqual({ success: false, error: 'Minimum duration is 15 minutes' })
    expect(createServerSupabaseClient).not.toHaveBeenCalled()
  })

  it('returns a generic failure when the update errors', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    jest.mocked(requireRole).mockResolvedValue(makeProfile())
    const { from } = makeSupabaseClient(
      { data: { doctor_id: VALID_DOCTOR_ID, status: 'scheduled' }, error: null },
      { data: [], error: null },
      { data: null, error: { message: 'update failed' } },
    )
    jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)

    const result = await rescheduleAppointment('a1', validInput)

    expect(result).toEqual({ success: false, error: 'Failed to reschedule appointment.' })
    consoleErrorSpy.mockRestore()
  })
})