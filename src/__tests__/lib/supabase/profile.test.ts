/**
 * Tests for src/lib/supabase/profile.ts
 *
 * hasRole: pure function, no mocks needed.
 * getOrCreateProfile: mocks the real boundaries this function talks to
 *   (Clerk's currentUser, the Supabase client) - never mocked directly
 *   by tests of requireRole, since requireRole calls the REAL
 *   getOrCreateProfile. That composition is exactly what needs testing.
 * requireRole: also mocks next/navigation's redirect() so it throws,
 *   mirroring real Next.js behavior (redirect() never returns).
 */

jest.mock('@clerk/nextjs/server', () => ({
  currentUser: jest.fn(),
}))

jest.mock('next/navigation', () => ({
  redirect: jest.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  }),
}))

jest.mock('../../../lib/supabase/server', () => ({
  createServerSupabaseClient: jest.fn(),
}))

import { currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '../../../lib/supabase/server'
import { getOrCreateProfile, hasRole, requireRole } from '../../../lib/supabase/profile'
import { createTestProfile, TEST_CLINIC_ID } from '../../fixtures'

// Builds a fake Supabase client matching the exact chain shapes
// profile.ts actually calls:
//   .from('profiles').select('*').eq(...).maybeSingle()
//   .from('profiles').insert({...}).select().single()
//
// Return type is deliberately `any`: the real SupabaseClient type has
// 20+ properties (auth, realtime, storage, ...) that are irrelevant to
// what profile.ts actually calls. jest.mocked() now correctly enforces
// the full real type on .mockReturnValue(), so without this the fix
// would be to construct a complete fake SupabaseClient - not something
// a focused unit test should do. The chain behavior is what's under
// test, not structural completeness against the SDK's public surface.
function makeMockSupabaseClient(config: {
  existing?: { data: any; error: any }
  inserted?: { data: any; error: any }
} = {}): any {
  const maybeSingle = jest.fn().mockResolvedValue(config.existing ?? { data: null, error: null })
  const single = jest.fn().mockResolvedValue(config.inserted ?? { data: null, error: null })
  const eq = jest.fn().mockReturnValue({ maybeSingle })
  const select = jest.fn().mockReturnValue({ eq, single })
  const insert = jest.fn().mockReturnValue({ select })
  const from = jest.fn().mockReturnValue({ select, insert })
  return { from, calls: { from, select, eq, insert, maybeSingle, single } }
}

// Same reasoning as above: Clerk's real User type has 30+ properties
// (passwordEnabled, totpEnabled, backupCodeEnabled, ...) that profile.ts
// never reads. Only id/firstName/lastName/emailAddresses are used.
const fakeClerkUser = (
  over: Partial<{
    id: string
    firstName: string | null
    lastName: string | null
    emails: string[]
  }> = {},
): any => ({
  id: over.id ?? 'clerk-user-abc',
  // firstName/lastName use `in` rather than `??` on purpose: `??` can't
  // distinguish "caller didn't pass this field" from "caller explicitly
  // passed null", and tests below rely on passing null explicitly.
  firstName: 'firstName' in over ? over.firstName : 'Dr',
  lastName: 'lastName' in over ? over.lastName : 'Test',
  emailAddresses: (over.emails ?? ['doctor@test.clinic']).map((emailAddress) => ({
    emailAddress,
  })),
})

describe('hasRole', () => {
  it('returns true when the profile role is in the allowed list', () => {
    const profile = createTestProfile({ role: 'doctor' })
    expect(hasRole(profile, 'doctor')).toBe(true)
    expect(hasRole(profile, 'staff', 'doctor')).toBe(true)
  })

  it('returns false when the profile role is not in the allowed list', () => {
    const profile = createTestProfile({ role: 'patient' })
    expect(hasRole(profile, 'doctor')).toBe(false)
    expect(hasRole(profile, 'doctor', 'staff')).toBe(false)
  })

  it('returns false when profile is null', () => {
    expect(hasRole(null, 'doctor')).toBe(false)
  })

  it('returns false when no allowed roles are passed', () => {
    const profile = createTestProfile({ role: 'doctor' })
    expect(hasRole(profile)).toBe(false)
  })
})

describe('getOrCreateProfile', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns null and never touches Supabase when there is no signed-in Clerk user', async () => {
    jest.mocked(currentUser).mockResolvedValue(null)

    const result = await getOrCreateProfile()

    expect(result).toBeNull()
    expect(createServerSupabaseClient).not.toHaveBeenCalled()
  })

  it('returns the existing profile when one is already linked to this Clerk user', async () => {
    jest.mocked(currentUser).mockResolvedValue(fakeClerkUser({ id: 'clerk-user-abc' }))
    const existingProfile = createTestProfile({ clerk_user_id: 'clerk-user-abc', role: 'doctor' })
    const mockClient = makeMockSupabaseClient({ existing: { data: existingProfile, error: null } })
    jest.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

    const result = await getOrCreateProfile()

    expect(result).toEqual(existingProfile)
    expect(mockClient.calls.insert).not.toHaveBeenCalled()
  })

  it('creates a new profile defaulting to role "patient" when none exists yet', async () => {
    jest.mocked(currentUser).mockResolvedValue(
      fakeClerkUser({ id: 'new-clerk-user', firstName: 'Jane', lastName: 'Doe', emails: ['jane@example.com'] }),
    )
    const createdProfile = createTestProfile({
      clerk_user_id: 'new-clerk-user',
      role: 'patient',
      full_name: 'Jane Doe',
      email: 'jane@example.com',
    })
    const mockClient = makeMockSupabaseClient({
      existing: { data: null, error: null },
      inserted: { data: createdProfile, error: null },
    })
    jest.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

    const result = await getOrCreateProfile()

    expect(result).toEqual(createdProfile)
    expect(mockClient.calls.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        clerk_user_id: 'new-clerk-user',
        email: 'jane@example.com',
        full_name: 'Jane Doe',
        role: 'patient',
      }),
    )
  })

  // This test documents CURRENT behavior — it is not an endorsement.
  // DEFAULT_CLINIC_ID is hardcoded in profile.ts. This is the known
  // single-clinic isolation gap already flagged for Chat 24, not
  // something introduced or newly accepted here.
  it('defaults new profiles to the hardcoded DEFAULT_CLINIC_ID (known gap, tracked for Chat 24)', async () => {
    jest.mocked(currentUser).mockResolvedValue(fakeClerkUser({ id: 'new-clerk-user' }))
    const mockClient = makeMockSupabaseClient({
      existing: { data: null, error: null },
      inserted: { data: createTestProfile(), error: null },
    })
    jest.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

    await getOrCreateProfile()

    expect(mockClient.calls.insert).toHaveBeenCalledWith(
      expect.objectContaining({ clinic_id: TEST_CLINIC_ID }),
    )
  })

  it('falls back to an empty string email when Clerk has no email addresses', async () => {
    jest.mocked(currentUser).mockResolvedValue(fakeClerkUser({ id: 'no-email-user', emails: [] }))
    const mockClient = makeMockSupabaseClient({
      existing: { data: null, error: null },
      inserted: { data: createTestProfile(), error: null },
    })
    jest.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

    await getOrCreateProfile()

    expect(mockClient.calls.insert).toHaveBeenCalledWith(expect.objectContaining({ email: '' }))
  })

  it('sets full_name to null when Clerk has no first name', async () => {
    jest.mocked(currentUser).mockResolvedValue(
      fakeClerkUser({ id: 'no-name-user', firstName: null, lastName: null }),
    )
    const mockClient = makeMockSupabaseClient({
      existing: { data: null, error: null },
      inserted: { data: createTestProfile(), error: null },
    })
    jest.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

    await getOrCreateProfile()

    expect(mockClient.calls.insert).toHaveBeenCalledWith(expect.objectContaining({ full_name: null }))
  })

  it('returns null and does not throw when the insert fails', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    jest.mocked(currentUser).mockResolvedValue(fakeClerkUser({ id: 'db-error-user' }))
    const mockClient = makeMockSupabaseClient({
      existing: { data: null, error: null },
      inserted: { data: null, error: { message: 'insert failed' } },
    })
    jest.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

    const result = await getOrCreateProfile()

    expect(result).toBeNull()
    expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to create profile:', { message: 'insert failed' })

    consoleErrorSpy.mockRestore()
  })
})

describe('requireRole', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns the profile when its role is in the allowed list', async () => {
    jest.mocked(currentUser).mockResolvedValue(fakeClerkUser({ id: 'doctor-user' }))
    const doctorProfile = createTestProfile({ clerk_user_id: 'doctor-user', role: 'doctor' })
    const mockClient = makeMockSupabaseClient({ existing: { data: doctorProfile, error: null } })
    jest.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

    const result = await requireRole('doctor')

    expect(result).toEqual(doctorProfile)
    expect(redirect).not.toHaveBeenCalled()
  })

  it('accepts any of several allowed roles', async () => {
    jest.mocked(currentUser).mockResolvedValue(fakeClerkUser({ id: 'staff-user' }))
    const staffProfile = createTestProfile({ clerk_user_id: 'staff-user', role: 'staff' })
    const mockClient = makeMockSupabaseClient({ existing: { data: staffProfile, error: null } })
    jest.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

    const result = await requireRole('doctor', 'staff')

    expect(result).toEqual(staffProfile)
    expect(redirect).not.toHaveBeenCalled()
  })

  it('redirects to "/" when the profile role is not allowed', async () => {
    jest.mocked(currentUser).mockResolvedValue(fakeClerkUser({ id: 'patient-user' }))
    const patientProfile = createTestProfile({ clerk_user_id: 'patient-user', role: 'patient' })
    const mockClient = makeMockSupabaseClient({ existing: { data: patientProfile, error: null } })
    jest.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

    await expect(requireRole('doctor')).rejects.toThrow('NEXT_REDIRECT:/')
    expect(redirect).toHaveBeenCalledWith('/')
  })

  it('redirects to "/" when there is no signed-in user at all', async () => {
    jest.mocked(currentUser).mockResolvedValue(null)

    await expect(requireRole('doctor')).rejects.toThrow('NEXT_REDIRECT:/')
    expect(redirect).toHaveBeenCalledWith('/')
  })
})