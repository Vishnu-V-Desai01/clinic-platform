'use server'

import { redirect } from 'next/navigation'
import { createClinicAndBecomeAdmin, requireRole } from '@/lib/supabase/profile'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createClinicSchema } from './schema'

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }

export async function createClinicOnboardingAction(
  clinicName: string
): Promise<ActionResult<null>> {
  const parsed = createClinicSchema.safeParse({ clinicName })

  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  try {
    await createClinicAndBecomeAdmin(parsed.data.clinicName)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create clinic'
    return { success: false, error: message }
  }

  redirect('/dashboard')
}

// Marks the first-login welcome as seen, then sends them to whichever
// dashboard they picked. If the update fails silently, worst case they
// see the welcome page once more next login — not worth blocking the
// redirect over.
export async function completeAdminOnboardingAction(
  destination: 'admin' | 'doctor'
): Promise<never> {
  const profile = await requireRole('doctor')

  if (profile.is_clinic_admin) {
    const supabase = createServerSupabaseClient()
    await supabase.from('profiles').update({ has_admin_onboarded: true }).eq('id', profile.id)
  }

  redirect(destination === 'admin' ? '/dashboard/admin' : '/dashboard/patients')
}