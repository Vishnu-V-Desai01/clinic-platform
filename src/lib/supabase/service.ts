// src/lib/supabase/service.ts
import { createClient } from '@supabase/supabase-js'

/**
 * Service-role Supabase client — bypasses RLS entirely.
 *
 * ONLY use this in server-to-server contexts with no Clerk session:
 * webhooks, cron jobs, admin scripts. NEVER import this in a route or
 * server action that runs on behalf of a logged-in user — it has full
 * database access regardless of RLS policies.
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in env (server-only, never exposed
 * to the client — do NOT prefix with NEXT_PUBLIC_).
 */
export function createServiceSupabaseClient() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured')
  }

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}