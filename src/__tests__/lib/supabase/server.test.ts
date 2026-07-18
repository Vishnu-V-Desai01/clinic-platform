/**
 * Tests for src/lib/supabase/server.ts
 *
 * createServerSupabaseClient() is the Clerk <-> Supabase JWT bridge:
 * it configures the Supabase client to fetch its auth token from the
 * current Clerk session on every request. A regression here would
 * silently break every RLS-protected query in the app, since
 * get_my_role() / get_my_clinic_id() depend on that token's claims.
 */

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(),
}))

jest.mock('@clerk/nextjs/server', () => ({
  auth: jest.fn(),
}))

import { createClient } from '@supabase/supabase-js'
import { auth } from '@clerk/nextjs/server'
import { createServerSupabaseClient } from '../../../lib/supabase/server'

describe('createServerSupabaseClient', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('creates a client with the configured Supabase URL and anon key', () => {
    createServerSupabaseClient()

    expect(createClient).toHaveBeenCalledTimes(1)
    const [url, anonKey] = jest.mocked(createClient).mock.calls[0]
    expect(url).toBe(process.env.NEXT_PUBLIC_SUPABASE_URL)
    expect(anonKey).toBe(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  })

  it('wires up an accessToken() function in the client options', () => {
    createServerSupabaseClient()

    const options = jest.mocked(createClient).mock.calls[0][2]!
    expect(typeof options.accessToken).toBe('function')
  })

  it('accessToken() resolves the token from the current Clerk session', async () => {
    // Cast as any: Clerk's real signed-in session type requires several
    // more fields (sessionClaims, sessionStatus, actor, orgId, ...) that
    // accessToken()'s own implementation never reads - it only calls
    // .getToken(). Same reasoning as the fakeClerkUser/makeMockSupabaseClient
    // helpers in profile.test.ts.
    jest.mocked(auth).mockResolvedValue({
      getToken: jest.fn().mockResolvedValue('fake-jwt-token'),
      userId: 'test-user-id',
      sessionId: 'test-session-id',
    } as any)

    createServerSupabaseClient()
    const options = jest.mocked(createClient).mock.calls[0][2]!
    const token = await options.accessToken!()

    expect(token).toBe('fake-jwt-token')
  })

  it('accessToken() passes through null when signed out (no session)', async () => {
    jest.mocked(auth).mockResolvedValue({
      getToken: jest.fn().mockResolvedValue(null),
      userId: null,
      sessionId: null,
    } as any)

    createServerSupabaseClient()
    const options = jest.mocked(createClient).mock.calls[0][2]!
    const token = await options.accessToken!()

    expect(token).toBeNull()
  })
})