/**
 * Tests for src/features/consent/actions.ts
 *
 * requireRole is mocked as an already-trusted boundary (fully tested in
 * lib/supabase/profile.test.ts). Supabase is mocked entirely: these tests
 * verify this file's own logic - what gets sent to Supabase and how - not
 * RLS policies or real Postgres behavior.
 *
 * Note on error handling: unlike patients/actions.ts, this file mixes two
 * different styles - getPatientConsents/hasActiveConsent throw or
 * fail-closed directly, while grantConsent/revokeConsent use a Result
 * ({success, error}) wrapper. Tests reflect each function's actual
 * contract rather than assuming one uniform pattern.
 */

jest.mock('@/lib/supabase/profile', () => ({
  requireRole: jest.fn(),
}))

jest.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: jest.fn(),
}))

jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
}))

import { requireRole } from '@/lib/supabase/profile'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import {
  getPatientConsents,
  hasActiveConsent,
  grantConsent,
  revokeConsent,
} from '../../../features/consent/actions'

// Same reusable chainable/awaitable fake used for patients/actions.test.ts -
// every filter/modifier method returns the same object (any call order
// works), .single()/.maybeSingle() resolve the configured result as a
// terminal call, and the object itself is directly awaitable for queries
// that never call a terminal method.
function makeChain(result: { data: any; error: any }) {
  const chain: any = {}
  const methods = ['select', 'eq', 'is', 'in', 'order', 'update', 'insert', 'upsert', 'delete']
  for (const m of methods) {
    chain[m] = jest.fn(() => chain)
  }
  chain.single = jest.fn(() => Promise.resolve(result))
  chain.maybeSingle = jest.fn(() => Promise.resolve(result))
  chain.then = (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject)
  return chain
}

// For functions that make exactly one supabase.from(...) call.
function makeSupabaseClient(result: { data: any; error: any }) {
  const chain = makeChain(result)
  const from = jest.fn(() => chain)
  return { from, chain }
}

// For functions that make multiple sequential supabase.from(...) calls
// with different expected results per call, in order (grantConsent now
// does an ownership-check query before its upsert).
function makeSupabaseClientSequence(...results: { data: any; error: any }[]) {
  const chains = results.map(makeChain)
  const from = jest.fn()
  chains.forEach((chain) => from.mockReturnValueOnce(chain))
  return { from, chains }
}

function makeProfile(overrides: { id?: string; clinic_id?: string | null; role?: string } = {}): any {
  return {
    id: overrides.id ?? 'doctor-1',
    // clinic_id uses `in` rather than `??` on purpose: `??` can't tell
    // "not provided" from "explicitly null".
    clinic_id: 'clinic_id' in overrides ? overrides.clinic_id : 'clinic-a',
    role: overrides.role ?? 'doctor',
    clerk_user_id: 'clerk-1',
    email: 'doc@test.clinic',
    full_name: 'Dr Test',
  }
}

const VALID_PATIENT_ID = '874ad51a-b42d-4ac8-b988-55ac10645308'
const VALID_CONSENT_ID = '22222222-2222-4222-8222-222222222222'

beforeEach(() => {
  jest.useFakeTimers()
  jest.setSystemTime(new Date('2026-07-15T10:00:00.000Z'))
})

afterEach(() => {
  jest.useRealTimers()
})

describe('getPatientConsents', () => {
  it('returns all consent records for the patient, active and revoked alike (no is_active filter)', async () => {
    jest.mocked(requireRole).mockResolvedValue(makeProfile())
    const records = [
      { id: 'c1', purpose: 'data_processing', is_active: true },
      { id: 'c2', purpose: 'whatsapp_notifications', is_active: false },
    ]
    const { from, chain } = makeSupabaseClient({ data: records, error: null })
    jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)

    const result = await getPatientConsents('p1')

    expect(result).toEqual(records)
    expect(chain.eq).toHaveBeenCalledWith('patient_id', 'p1')
    expect(chain.is).not.toHaveBeenCalled() // confirms no is_active filter is applied here
  })

  it('returns an empty array, not null, when there are no records', async () => {
    jest.mocked(requireRole).mockResolvedValue(makeProfile())
    const { from } = makeSupabaseClient({ data: null, error: null })
    jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)

    const result = await getPatientConsents('p1')

    expect(result).toEqual([])
  })

  it('throws (does not return a Result) when the query errors', async () => {
    jest.mocked(requireRole).mockResolvedValue(makeProfile())
    const { from } = makeSupabaseClient({ data: null, error: { message: 'db down' } })
    jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)

    await expect(getPatientConsents('p1')).rejects.toThrow('db down')
  })

  it('CONTRASTS with patients/actions.ts: an unauthorized caller genuinely propagates the redirect here, since this function has no try/catch to swallow it', async () => {
    jest.mocked(requireRole).mockRejectedValue(new Error('NEXT_REDIRECT:/'))

    await expect(getPatientConsents('p1')).rejects.toThrow('NEXT_REDIRECT:/')
    expect(createServerSupabaseClient).not.toHaveBeenCalled()
  })
})

describe('hasActiveConsent', () => {
  it('returns true when an active consent row exists', async () => {
    jest.mocked(requireRole).mockResolvedValue(makeProfile())
    const { from, chain } = makeSupabaseClient({ data: { id: 'c1' }, error: null })
    jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)

    const result = await hasActiveConsent('p1', 'whatsapp_notifications')

    expect(result).toBe(true)
    expect(chain.eq).toHaveBeenCalledWith('patient_id', 'p1')
    expect(chain.eq).toHaveBeenCalledWith('purpose', 'whatsapp_notifications')
    expect(chain.eq).toHaveBeenCalledWith('is_active', true)
  })

  it('returns false when no active row exists', async () => {
    jest.mocked(requireRole).mockResolvedValue(makeProfile())
    const { from } = makeSupabaseClient({ data: null, error: null })
    jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)

    const result = await hasActiveConsent('p1', 'whatsapp_notifications')

    expect(result).toBe(false)
  })

  it('fails closed: returns false (not a thrown error) when the query itself errors', async () => {
    // This is the safer default for a consent gate - other features call
    // this before acting (e.g. before sending a WhatsApp message), so
    // treating an unknown/errored state as "no consent" avoids acting
    // without confirmed consent.
    jest.mocked(requireRole).mockResolvedValue(makeProfile())
    const { from } = makeSupabaseClient({ data: null, error: { message: 'db down' } })
    jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)

    const result = await hasActiveConsent('p1', 'whatsapp_notifications')

    expect(result).toBe(false)
  })
})

describe('grantConsent', () => {
  it('verifies the patient belongs to the caller\'s clinic before upserting', async () => {
    jest.mocked(requireRole).mockResolvedValue(makeProfile({ clinic_id: 'clinic-a' }))
    const { from, chains } = makeSupabaseClientSequence(
      { data: { id: VALID_PATIENT_ID }, error: null }, // ownership check
      { data: null, error: null }, // upsert
    )
    jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)

    await grantConsent({ patient_id: VALID_PATIENT_ID, purpose: 'data_processing' })

    expect(chains[0].eq).toHaveBeenCalledWith('id', VALID_PATIENT_ID)
    expect(chains[0].eq).toHaveBeenCalledWith('clinic_id', 'clinic-a')
    expect(chains[0].is).toHaveBeenCalledWith('deleted_at', null)
  })

  it('FIXED: rejects granting consent for a patient outside the caller\'s clinic, before any upsert', async () => {
    // Previously patient_id was trusted from client input with no
    // ownership check at all - grantConsent would upsert a consent row
    // for any patient_id, regardless of which clinic it actually belongs
    // to. Now it's verified first.
    jest.mocked(requireRole).mockResolvedValue(makeProfile({ clinic_id: 'clinic-a' }))
    const { from, chains } = makeSupabaseClientSequence(
      { data: null, error: null }, // ownership check: no match in this clinic
    )
    jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)

    const result = await grantConsent({ patient_id: VALID_PATIENT_ID, purpose: 'data_processing' })

    expect(result).toEqual({ success: false, error: 'Patient not found.' })
    expect(chains[0].upsert).not.toHaveBeenCalled()
  })

  it('surfaces an error from the ownership check itself, distinct from an upsert error', async () => {
    jest.mocked(requireRole).mockResolvedValue(makeProfile())
    const { from } = makeSupabaseClientSequence(
      { data: null, error: { message: 'db down during lookup' } },
    )
    jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)

    const result = await grantConsent({ patient_id: VALID_PATIENT_ID, purpose: 'data_processing' })

    expect(result).toEqual({ success: false, error: 'db down during lookup' })
  })

  it('upserts an active record with the caller as granted_by, clearing any prior revocation fields', async () => {
    jest.mocked(requireRole).mockResolvedValue(makeProfile({ id: 'doctor-1', clinic_id: 'clinic-a' }))
    const { from, chains } = makeSupabaseClientSequence(
      { data: { id: VALID_PATIENT_ID }, error: null },
      { data: null, error: null },
    )
    jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)

    const result = await grantConsent({
      patient_id: VALID_PATIENT_ID,
      purpose: 'data_processing',
      notes: 'Verbal confirmation',
    })

    expect(result).toEqual({ success: true })
    expect(chains[1].upsert).toHaveBeenCalledWith(
      {
        clinic_id: 'clinic-a',
        patient_id: VALID_PATIENT_ID,
        purpose: 'data_processing',
        is_active: true,
        granted_by: 'doctor-1',
        granted_at: '2026-07-15T10:00:00.000Z',
        revoked_by: null,
        revoked_at: null,
        notes: 'Verbal confirmation',
        updated_at: '2026-07-15T10:00:00.000Z',
      },
      { onConflict: 'patient_id,purpose' },
    )
  })

  it('stores null for notes when omitted (undefined from the optional schema field becomes null in the row)', async () => {
    jest.mocked(requireRole).mockResolvedValue(makeProfile())
    const { from, chains } = makeSupabaseClientSequence(
      { data: { id: VALID_PATIENT_ID }, error: null },
      { data: null, error: null },
    )
    jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)

    await grantConsent({ patient_id: VALID_PATIENT_ID, purpose: 'data_processing' })

    expect(chains[1].upsert).toHaveBeenCalledWith(
      expect.objectContaining({ notes: null }),
      expect.anything(),
    )
  })

  it('rejects invalid input with the schema error, before touching the database', async () => {
    jest.mocked(requireRole).mockResolvedValue(makeProfile())

    const result = await grantConsent({ patient_id: 'not-a-uuid', purpose: 'data_processing' })

    expect(result).toEqual({ success: false, error: 'Invalid patient ID' })
    expect(createServerSupabaseClient).not.toHaveBeenCalled()
  })

  it('surfaces the database error message directly when the upsert itself fails (ownership check passes first)', async () => {
    jest.mocked(requireRole).mockResolvedValue(makeProfile())
    const { from } = makeSupabaseClientSequence(
      { data: { id: VALID_PATIENT_ID }, error: null },
      { data: null, error: { message: 'unique constraint violated' } },
    )
    jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)

    const result = await grantConsent({ patient_id: VALID_PATIENT_ID, purpose: 'data_processing' })

    expect(result).toEqual({ success: false, error: 'unique constraint violated' })
  })

  it('revalidates the patient page on success', async () => {
    jest.mocked(requireRole).mockResolvedValue(makeProfile())
    const { from } = makeSupabaseClientSequence(
      { data: { id: VALID_PATIENT_ID }, error: null },
      { data: null, error: null },
    )
    jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)

    await grantConsent({ patient_id: VALID_PATIENT_ID, purpose: 'data_processing' })

    expect(revalidatePath).toHaveBeenCalledWith(`/patients/${VALID_PATIENT_ID}`)
  })

  it('does not call revalidatePath when validation fails', async () => {
    jest.mocked(requireRole).mockResolvedValue(makeProfile())

    await grantConsent({ patient_id: 'not-a-uuid', purpose: 'data_processing' })

    expect(revalidatePath).not.toHaveBeenCalled()
  })
})

describe('revokeConsent', () => {
  it('marks the record inactive with the caller as revoker, without touching granted_by/granted_at', async () => {
    jest.mocked(requireRole).mockResolvedValue(makeProfile({ id: 'doctor-2' }))
    const { from, chain } = makeSupabaseClient({ data: { id: VALID_CONSENT_ID }, error: null })
    jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)

    const result = await revokeConsent(
      { consent_id: VALID_CONSENT_ID, notes: 'Patient withdrew consent' },
      VALID_PATIENT_ID,
    )

    expect(result).toEqual({ success: true })
    expect(chain.update).toHaveBeenCalledWith({
      is_active: false,
      revoked_by: 'doctor-2',
      revoked_at: '2026-07-15T10:00:00.000Z',
      notes: 'Patient withdrew consent',
      updated_at: '2026-07-15T10:00:00.000Z',
    })
    const updatePayload = chain.update.mock.calls[0][0]
    expect(updatePayload).not.toHaveProperty('granted_by')
    expect(updatePayload).not.toHaveProperty('granted_at')
  })

  it('FIXED: the update is now scoped by clinic_id as well as consent_id', async () => {
    // Previously this update only filtered by .eq('id', consent_id), with
    // no clinic_id check at the application level - unlike every mutation
    // in patients/actions.ts. Now it matches that pattern.
    jest.mocked(requireRole).mockResolvedValue(makeProfile({ clinic_id: 'clinic-a' }))
    const { from, chain } = makeSupabaseClient({ data: { id: VALID_CONSENT_ID }, error: null })
    jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)

    await revokeConsent({ consent_id: VALID_CONSENT_ID }, VALID_PATIENT_ID)

    expect(chain.eq).toHaveBeenCalledWith('id', VALID_CONSENT_ID)
    expect(chain.eq).toHaveBeenCalledWith('clinic_id', 'clinic-a')
  })

  it('FIXED: returns "Consent record not found" when nothing matches (e.g. a different clinic\'s consent_id)', async () => {
    jest.mocked(requireRole).mockResolvedValue(makeProfile())
    const { from } = makeSupabaseClient({ data: null, error: null })
    jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)

    const result = await revokeConsent({ consent_id: VALID_CONSENT_ID }, VALID_PATIENT_ID)

    expect(result).toEqual({ success: false, error: 'Consent record not found.' })
  })

  it('stores null for notes when omitted', async () => {
    jest.mocked(requireRole).mockResolvedValue(makeProfile())
    const { from, chain } = makeSupabaseClient({ data: { id: VALID_CONSENT_ID }, error: null })
    jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)

    await revokeConsent({ consent_id: VALID_CONSENT_ID }, VALID_PATIENT_ID)

    expect(chain.update).toHaveBeenCalledWith(expect.objectContaining({ notes: null }))
  })

  it('rejects invalid input with the schema error, before touching the database', async () => {
    jest.mocked(requireRole).mockResolvedValue(makeProfile())

    const result = await revokeConsent({ consent_id: 'not-a-uuid' }, VALID_PATIENT_ID)

    expect(result).toEqual({ success: false, error: 'Invalid consent ID' })
    expect(createServerSupabaseClient).not.toHaveBeenCalled()
  })

  it('surfaces the database error message directly on failure', async () => {
    jest.mocked(requireRole).mockResolvedValue(makeProfile())
    const { from } = makeSupabaseClient({ data: null, error: { message: 'row not found' } })
    jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)

    const result = await revokeConsent({ consent_id: VALID_CONSENT_ID }, VALID_PATIENT_ID)

    expect(result).toEqual({ success: false, error: 'row not found' })
  })

  it('revalidates using the separately-passed patientId, not anything derived from the consent record', async () => {
    jest.mocked(requireRole).mockResolvedValue(makeProfile())
    const { from } = makeSupabaseClient({ data: { id: VALID_CONSENT_ID }, error: null })
    jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)

    await revokeConsent({ consent_id: VALID_CONSENT_ID }, 'a-completely-different-patient-id')

    expect(revalidatePath).toHaveBeenCalledWith('/patients/a-completely-different-patient-id')
  })
})