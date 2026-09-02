'use server'

import { redirect } from 'next/navigation'
import { createClinicAndBecomeAdmin, requireRole } from '@/lib/supabase/profile'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createClinicSchema, type CreateClinicInput } from './schema'
import { TOS_VERSION } from './legal-content'

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }

export async function createClinicOnboardingAction(
  input: CreateClinicInput
): Promise<ActionResult<null>> {
  const parsed = createClinicSchema.safeParse(input)

  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  try {
    await createClinicAndBecomeAdmin({
      clinicName: parsed.data.clinicName,
      fullNameOverride: parsed.data.fullName,
      phone: parsed.data.phone || null,
      contactEmail: parsed.data.email || null,
      address: parsed.data.address || null,
      city: parsed.data.city || null,
      state: parsed.data.state || null,
      postalCode: parsed.data.postalCode || null,
      licenseNumber: parsed.data.licenseNumber || null,
      gstNumber: parsed.data.gstNumber || null,
      hfrId: parsed.data.hfrId || null,
      tosVersion: TOS_VERSION,
    })
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