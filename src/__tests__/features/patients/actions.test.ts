/**
 * Tests for src/features/patients/actions.ts
 *
 * requireRole itself is fully tested in lib/supabase/profile.test.ts -
 * here it's mocked as an already-trusted boundary, not re-verified.
 * Supabase is mocked entirely (per this chat's brief): these tests verify
 * this file's own logic - what gets sent to Supabase and how results are
 * mapped - not RLS policies or real Postgres behavior.
 */

jest.mock('@/lib/supabase/profile', () => ({
  requireRole: jest.fn(),
}))

jest.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: jest.fn(),
}))

jest.mock('@/features/messaging/actions', () => ({
  createRegistrationMessage: jest.fn(),
}))

jest.mock('next/server', () => ({
  after: jest.fn(),
}))

import { requireRole } from '@/lib/supabase/profile'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createRegistrationMessage } from '@/features/messaging/actions'
import { after } from 'next/server'
import {
  listPatients,
  getPatient,
  createPatient,
  updatePatient,
  archivePatient,
} from '../../../features/patients/actions'

// A chainable, awaitable fake matching how the real Supabase query builder
// behaves: every filter/modifier method returns the same object (so any
// call order/repetition works, e.g. .eq().eq()), .single()/.maybeSingle()
// resolve the configured result as a terminal call, AND the object itself
// is directly awaitable (some queries in this file, e.g. listPatients and
// archivePatient, never call .single() - they just await the chain).
function makeSupabaseClient(result: { data: any; error: any }) {
  const chain: any = {}
  const methods = ['select', 'eq', 'is', 'in', 'order', 'update', 'insert', 'delete', 'lt', 'gte', 'neq']
  for (const m of methods) {
    chain[m] = jest.fn(() => chain)
  }
  chain.single = jest.fn(() => Promise.resolve(result))
  chain.maybeSingle = jest.fn(() => Promise.resolve(result))
  chain.then = (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject)
  const from = jest.fn(() => chain)
  return { from, chain }
}

// Return type is `any` on purpose - requireRole's real return type is a
// large Profile object; only id/clinic_id/role are ever read by this file.
function makeProfile(overrides: { id?: string; clinic_id?: string | null; role?: string } = {}): any {
  return {
    id: overrides.id ?? 'doctor-1',
    // clinic_id uses `in` rather than `??` on purpose: `??` can't tell
    // "not provided" from "explicitly null", and the null-clinic_id
    // guard tests below rely on passing null explicitly.
    clinic_id: 'clinic_id' in overrides ? overrides.clinic_id : 'clinic-a',
    role: overrides.role ?? 'doctor',
    clerk_user_id: 'clerk-1',
    email: 'doc@test.clinic',
    full_name: 'Dr Test',
  }
}

const validFormInput = {
  firstName: 'Asha',
  lastName: 'Rao',
  dateOfBirth: '1990-05-15',
  gender: 'female',
  bloodGroup: '',
  status: 'active',
  assignedDoctorId: '',
  phone: '9876543210',
  email: '',
  addressLine: '',
  city: '',
  state: '',
  pincode: '',
  languagePreference: 'en',
  emergencyName: '',
  emergencyRelationship: '',
  emergencyPhone: '',
  allergies: [] as string[],
  conditions: [] as string[],
  notes: '',
}

describe('listPatients', () => {
  it('returns the list mapped to display shape, scoped to the caller clinic and excluding deleted rows', async () => {
    jest.mocked(requireRole).mockResolvedValue(makeProfile({ clinic_id: 'clinic-a' }))
    const rows = [
      {
        id: 'p1', patient_id_number: 'CLI-2026-000001', first_name: 'Asha', last_name: 'Rao',
        date_of_birth: '1990-05-15', gender: 'female', phone: '9876543210', status: 'active',
      },
      {
        id: 'p2', patient_id_number: null, first_name: 'Ravi', last_name: 'Kumar',
        date_of_birth: null, gender: 'male', phone: '9123456780', status: 'active',
      },
    ]
    const { from, chain } = makeSupabaseClient({ data: rows, error: null })
    jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)

    const result = await listPatients()

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toHaveLength(2)
      expect(result.data[0].mrn).toBe('CLI-2026-000001')
      expect(result.data[1].mrn).toBe('—') // null patient_id_number falls back to an em dash
      expect(result.data[0].firstName).toBe('Asha')
    }
    expect(chain.eq).toHaveBeenCalledWith('clinic_id', 'clinic-a')
    expect(chain.is).toHaveBeenCalledWith('deleted_at', null)
  })

  it('returns a generic failure and logs when the query errors', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    jest.mocked(requireRole).mockResolvedValue(makeProfile())
    const { from } = makeSupabaseClient({ data: null, error: { message: 'db down' } })
    jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)

    const result = await listPatients()

    expect(result).toEqual({ success: false, error: 'Failed to load patients.' })
    expect(consoleErrorSpy).toHaveBeenCalled()
    consoleErrorSpy.mockRestore()
  })

  it('FIXED: an unauthorized caller now genuinely gets the redirect, not a swallowed generic error', async () => {
    // requireRole() now runs before the try block (previously it ran
    // inside it), so its redirect-throw is no longer caught here and
    // converted into a generic failure. This test used to document the
    // opposite behavior - see the findings log for when this changed.
    jest.mocked(requireRole).mockRejectedValue(new Error('NEXT_REDIRECT:/'))

    await expect(listPatients()).rejects.toThrow('NEXT_REDIRECT:/')
    expect(createServerSupabaseClient).not.toHaveBeenCalled()
  })
})

describe('getPatient', () => {
  it('returns the record scoped to id + clinic + not-deleted', async () => {
    jest.mocked(requireRole).mockResolvedValue(makeProfile({ clinic_id: 'clinic-a' }))
    const record = { id: 'p1', clinic_id: 'clinic-a', first_name: 'Asha' }
    const { from, chain } = makeSupabaseClient({ data: record, error: null })
    jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)

    const result = await getPatient('p1')

    expect(result).toEqual({ success: true, data: record })
    expect(chain.eq).toHaveBeenCalledWith('id', 'p1')
    expect(chain.eq).toHaveBeenCalledWith('clinic_id', 'clinic-a')
    expect(chain.is).toHaveBeenCalledWith('deleted_at', null)
  })

  it('returns "Patient not found" when the query succeeds with no matching row', async () => {
    // Documenting the code's own defensive check - real Supabase's
    // .single() typically errors rather than returning null data when
    // zero rows match, so this branch may be rarely hit in practice, but
    // the code explicitly handles it, so it's tested.
    jest.mocked(requireRole).mockResolvedValue(makeProfile())
    const { from } = makeSupabaseClient({ data: null, error: null })
    jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)

    const result = await getPatient('missing-id')

    expect(result).toEqual({ success: false, error: 'Patient not found.' })
  })

  it('returns a generic failure when the query errors', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    jest.mocked(requireRole).mockResolvedValue(makeProfile())
    const { from } = makeSupabaseClient({ data: null, error: { message: 'db down' } })
    jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)

    const result = await getPatient('p1')

    expect(result).toEqual({ success: false, error: 'Failed to load patient.' })
    consoleErrorSpy.mockRestore()
  })
})

describe('createPatient', () => {
  it('FIXED: rejects with no DB call when the caller profile has no clinic_id (should not happen for doctor/staff, but clinic_id is genuinely nullable on Profile now)', async () => {
    jest.mocked(requireRole).mockResolvedValue(makeProfile({ role: 'doctor', clinic_id: null }))

    const result = await createPatient(validFormInput)

    expect(result).toEqual({ success: false, error: 'Your account is not associated with a clinic.' })
    expect(createServerSupabaseClient).not.toHaveBeenCalled()
  })

  it('doctor: assigns the patient to themselves, ignoring whatever assignedDoctorId the client sent', async () => {
    jest.mocked(requireRole).mockResolvedValue(makeProfile({ id: 'doctor-1', role: 'doctor' }))
    const created = { id: 'new-patient', assigned_doctor_id: 'doctor-1' }
    const { from, chain } = makeSupabaseClient({ data: created, error: null })
    jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)

    const result = await createPatient({
      ...validFormInput,
      assignedDoctorId: '22222222-2222-4222-8222-222222222222', // some other doctor's id
    })

    expect(result).toEqual({ success: true, data: created })
    expect(chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ assigned_doctor_id: 'doctor-1' }),
    )
  })

  it('staff: uses the assignedDoctorId they provided', async () => {
    jest.mocked(requireRole).mockResolvedValue(makeProfile({ id: 'staff-1', role: 'staff' }))
    const chosenDoctorId = '874ad51a-b42d-4ac8-b988-55ac10645308'
    const created = { id: 'new-patient', assigned_doctor_id: chosenDoctorId }
    const { from, chain } = makeSupabaseClient({ data: created, error: null })
    jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)

    const result = await createPatient({ ...validFormInput, assignedDoctorId: chosenDoctorId })

    expect(result).toEqual({ success: true, data: created })
    expect(chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ assigned_doctor_id: chosenDoctorId }),
    )
  })

  it('staff: rejects with no DB call when no doctor is assigned', async () => {
    jest.mocked(requireRole).mockResolvedValue(makeProfile({ role: 'staff' }))

    const result = await createPatient({ ...validFormInput, assignedDoctorId: '' })

    expect(result).toEqual({ success: false, error: 'Please assign a doctor for this patient.' })
    expect(createServerSupabaseClient).not.toHaveBeenCalled()
  })

  it('rejects invalid input with the schema error, before touching the database', async () => {
    jest.mocked(requireRole).mockResolvedValue(makeProfile())

    const result = await createPatient({ ...validFormInput, firstName: '' })

    expect(result).toEqual({ success: false, error: 'First name is required' })
    expect(createServerSupabaseClient).not.toHaveBeenCalled()
  })

  it('returns a generic failure when the insert errors', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    jest.mocked(requireRole).mockResolvedValue(makeProfile({ role: 'doctor' }))
    const { from } = makeSupabaseClient({ data: null, error: { message: 'insert failed' } })
    jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)

    const result = await createPatient(validFormInput)

    expect(result).toEqual({ success: false, error: 'Failed to register patient.' })
    consoleErrorSpy.mockRestore()
  })

  describe('post-creation registration message (via after())', () => {
    it('schedules a callback via after() and returns success without waiting for it', async () => {
      jest.mocked(requireRole).mockResolvedValue(makeProfile({ role: 'doctor' }))
      const created = { id: 'new-patient-1' }
      const { from } = makeSupabaseClient({ data: created, error: null })
      jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)

      const result = await createPatient(validFormInput)

      expect(result).toEqual({ success: true, data: created })
      expect(after).toHaveBeenCalledTimes(1)
      // createRegistrationMessage is only called from inside the callback
      // after() was handed - not synchronously by createPatient - and that
      // callback was never manually invoked here. This is what "truly
      // non-blocking" in the source comment actually means.
      expect(createRegistrationMessage).not.toHaveBeenCalled()
    })

    it('the scheduled callback calls createRegistrationMessage with the new patient id', async () => {
      jest.mocked(requireRole).mockResolvedValue(makeProfile({ role: 'doctor' }))
      const created = { id: 'new-patient-2' }
      const { from } = makeSupabaseClient({ data: created, error: null })
      jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)
      jest.mocked(createRegistrationMessage).mockResolvedValue({ success: true } as any)

      await createPatient(validFormInput)
      const scheduledCallback = jest.mocked(after).mock.calls[0][0] as () => Promise<void>
      await scheduledCallback()

      expect(createRegistrationMessage).toHaveBeenCalledWith({ patientId: 'new-patient-2' })
    })

    it('a failure in the scheduled callback is caught and logged, not thrown', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
      jest.mocked(requireRole).mockResolvedValue(makeProfile({ role: 'doctor' }))
      const created = { id: 'new-patient-3' }
      const { from } = makeSupabaseClient({ data: created, error: null })
      jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)
      jest.mocked(createRegistrationMessage).mockRejectedValue(new Error('WhatsApp provider down'))

      await createPatient(validFormInput)
      const scheduledCallback = jest.mocked(after).mock.calls[0][0] as () => Promise<void>

      await expect(scheduledCallback()).resolves.toBeUndefined()
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[createPatient] Registration message failed:',
        expect.any(Error),
      )
      consoleErrorSpy.mockRestore()
    })
  })
})

describe('updatePatient', () => {
  it('FIXED: rejects with no DB call when the caller profile has no clinic_id', async () => {
    jest.mocked(requireRole).mockResolvedValue(makeProfile({ role: 'doctor', clinic_id: null }))

    const result = await updatePatient('p1', validFormInput)

    expect(result).toEqual({ success: false, error: 'Your account is not associated with a clinic.' })
    expect(createServerSupabaseClient).not.toHaveBeenCalled()
  })

  it('doctor: assigned_doctor_id is never included in the update payload, even if the form sends one', async () => {
    jest.mocked(requireRole).mockResolvedValue(makeProfile({ role: 'doctor', clinic_id: 'clinic-a' }))
    const updated = { id: 'p1' }
    const { from, chain } = makeSupabaseClient({ data: updated, error: null })
    jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)

    const result = await updatePatient('p1', {
      ...validFormInput,
      assignedDoctorId: '22222222-2222-4222-8222-222222222222', // some other doctor's id
    })

    expect(result).toEqual({ success: true, data: updated })
    const updatePayload = chain.update.mock.calls[0][0]
    expect(updatePayload).not.toHaveProperty('assigned_doctor_id')
  })

  it('staff: assigned_doctor_id IS included when they provide one', async () => {
    jest.mocked(requireRole).mockResolvedValue(makeProfile({ role: 'staff', clinic_id: 'clinic-a' }))
    const chosenDoctorId = '874ad51a-b42d-4ac8-b988-55ac10645308'
    const { from, chain } = makeSupabaseClient({ data: { id: 'p1' }, error: null })
    jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)

    await updatePatient('p1', { ...validFormInput, assignedDoctorId: chosenDoctorId })

    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({ assigned_doctor_id: chosenDoctorId }),
    )
  })

  it('staff: rejects with no DB call when no doctor is assigned', async () => {
    jest.mocked(requireRole).mockResolvedValue(makeProfile({ role: 'staff' }))

    const result = await updatePatient('p1', { ...validFormInput, assignedDoctorId: '' })

    expect(result).toEqual({ success: false, error: 'Please assign a doctor for this patient.' })
    expect(createServerSupabaseClient).not.toHaveBeenCalled()
  })

  it('never allows clinic_id to be changed via the update payload', async () => {
    jest.mocked(requireRole).mockResolvedValue(makeProfile({ role: 'doctor', clinic_id: 'clinic-a' }))
    const { from, chain } = makeSupabaseClient({ data: { id: 'p1' }, error: null })
    jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)

    await updatePatient('p1', validFormInput)

    const updatePayload = chain.update.mock.calls[0][0]
    expect(updatePayload).not.toHaveProperty('clinic_id')
  })

  it('scopes the update to id + clinic + not-deleted', async () => {
    jest.mocked(requireRole).mockResolvedValue(makeProfile({ role: 'doctor', clinic_id: 'clinic-a' }))
    const { from, chain } = makeSupabaseClient({ data: { id: 'p1' }, error: null })
    jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)

    await updatePatient('p1', validFormInput)

    expect(chain.eq).toHaveBeenCalledWith('id', 'p1')
    expect(chain.eq).toHaveBeenCalledWith('clinic_id', 'clinic-a')
    expect(chain.is).toHaveBeenCalledWith('deleted_at', null)
  })

  it('returns "Patient not found" when the update matches no row', async () => {
    jest.mocked(requireRole).mockResolvedValue(makeProfile({ role: 'doctor' }))
    const { from } = makeSupabaseClient({ data: null, error: null })
    jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)

    const result = await updatePatient('missing-id', validFormInput)

    expect(result).toEqual({ success: false, error: 'Patient not found.' })
  })

  it('rejects invalid input with the schema error, before touching the database', async () => {
    jest.mocked(requireRole).mockResolvedValue(makeProfile({ role: 'doctor' }))

    const result = await updatePatient('p1', { ...validFormInput, phone: '123' })

    expect(result).toEqual({ success: false, error: 'Enter a valid 10-digit mobile number' })
    expect(createServerSupabaseClient).not.toHaveBeenCalled()
  })
})

describe('archivePatient', () => {
  it('sets status to archived, scoped to id + clinic + not-deleted', async () => {
    jest.mocked(requireRole).mockResolvedValue(makeProfile({ role: 'doctor', clinic_id: 'clinic-a' }))
    const { from, chain } = makeSupabaseClient({ data: { id: 'p1' }, error: null })
    jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)

    const result = await archivePatient('p1')

    expect(result).toEqual({ success: true, data: { id: 'p1' } })
    expect(chain.update).toHaveBeenCalledWith({ status: 'archived' })
    expect(chain.eq).toHaveBeenCalledWith('id', 'p1')
    expect(chain.eq).toHaveBeenCalledWith('clinic_id', 'clinic-a')
    expect(chain.is).toHaveBeenCalledWith('deleted_at', null)
  })

  it('FIXED: returns "Patient not found" when the id matches no row in this clinic, instead of a false success', async () => {
    // Previously this function had no .select()/match check at all, so it
    // reported success:true unconditionally as long as there was no
    // Postgres error - even if zero rows were actually updated. Now it
    // selects the id back and checks for it, matching the same pattern
    // getPatient/updatePatient already used.
    jest.mocked(requireRole).mockResolvedValue(makeProfile({ role: 'doctor' }))
    const { from } = makeSupabaseClient({ data: null, error: null })
    jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)

    const result = await archivePatient('does-not-exist')

    expect(result).toEqual({ success: false, error: 'Patient not found.' })
  })

  it('returns a generic failure when the update errors', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    jest.mocked(requireRole).mockResolvedValue(makeProfile({ role: 'doctor' }))
    const { from } = makeSupabaseClient({ data: null, error: { message: 'db down' } })
    jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)

    const result = await archivePatient('p1')

    expect(result).toEqual({ success: false, error: 'Failed to archive patient.' })
    consoleErrorSpy.mockRestore()
  })
})