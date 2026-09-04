// src/features/consent/service.ts
//
// Session-free consent check for service-role / cron contexts.
//
// hasActiveConsent() in actions.ts opens with `await requireRole('doctor',
// 'staff')` — correct for every existing call site, all of which run
// inside a Clerk-authenticated server action. sendDueMedicineReminders()
// (src/lib/medicine-reminders/send-due-reminders.ts) is different: it's
// invoked by Vercel Cron (bearer-token auth, no Clerk session at all) or
// by an admin's manual "Run Now" button, and it already runs against a
// service-role Supabase client that bypasses RLS by necessity. Calling
// hasActiveConsent() from that context would throw on the role check
// before ever reaching the consent query.
//
// This file is deliberately NOT marked 'use server'. Every export from a
// 'use server' file becomes an RPC-callable server action reachable from
// the client bundle — for a mutating action that's fine because
// requireRole guards it, but a session-free consent *read* with no auth
// guard must never be reachable that way. Keeping this as a plain module
// means it can only ever be imported and called from other server-side
// code (like send-due-reminders.ts), never invoked directly by a client.
//
// Takes the caller's own Supabase client (service-role or otherwise)
// rather than constructing one, so send-due-reminders.ts's existing
// service-role client is reused instead of a second one being created.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ConsentPurpose } from './types'

export async function hasActiveConsentService(
  supabase: SupabaseClient,
  patientId: string,
  purpose: ConsentPurpose,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('patient_consents')
    .select('id')
    .eq('patient_id', patientId)
    .eq('purpose', purpose)
    .eq('is_active', true)
    .maybeSingle()

  if (error) {
    console.error('[hasActiveConsentService] query error:', error)
    return false
  }
  return data !== null
}