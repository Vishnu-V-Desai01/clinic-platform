'use server'

import { redirect } from 'next/navigation'
import { claimFamilyAccountByPhoneAndCreatePatientProfile } from '@/lib/supabase/profile'

// Wraps the phone-based claim for the client-side form on
// patient-portal/page.tsx. On success, redirects into the portal exactly
// like the email-based path already does — there is no "return and show
// a success state" step, matching the existing redirect-driven flow.
export async function claimByPhone(
  rawPhone: string
): Promise<{ success: false; error: string }> {
  const result = await claimFamilyAccountByPhoneAndCreatePatientProfile(rawPhone)

  if (!result.success) {
    return { success: false, error: result.error }
  }

  // redirect() throws internally — this line never returns normally on
  // the success path, so the function's declared failure-only return
  // type still holds for every path that actually completes.
  redirect('/portal')
}