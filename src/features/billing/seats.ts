import { createServiceSupabaseClient } from '@/lib/supabase/service'
import { TRIAL_DOCTOR_CAP, getEffectiveDoctorLimit } from './pricing'
import { getEnforcementMode, type CreateGuardResult } from './guard'
import type { SubscriptionTier } from './types'

/**
 * Call before creating a doctor invitation. Counts current doctors
 * (active + suspended) plus pending doctor invitations against the
 * clinic's limit, so several invites sent at once cannot overshoot it.
 */
export async function checkDoctorSeatAvailable(clinicId: string): Promise<CreateGuardResult> {
  const mode = getEnforcementMode()
  if (mode === 'off') return { allowed: true }

  try {
    const supabase = createServiceSupabaseClient()

    const [clinicRes, doctorsRes, pendingRes, addonRes] = await Promise.all([
      supabase
        .from('clinics')
        .select('subscription_status, subscription_tier')
        .eq('id', clinicId)
        .maybeSingle(),
      supabase.rpc('count_clinic_doctors', { p_clinic_id: clinicId }),
      supabase
        .from('invitations')
        .select('id', { count: 'exact', head: true })
        .eq('clinic_id', clinicId)
        .eq('role', 'doctor')
        .eq('status', 'pending'),
      supabase.rpc('get_active_addon_seats', { p_clinic_id: clinicId }),
    ])

    if (clinicRes.error || !clinicRes.data || doctorsRes.error || pendingRes.error || addonRes.error) {
      console.error('[billing seats] lookup failed, allowing:', clinicId)
      return { allowed: true }
    }

    const limit =
      clinicRes.data.subscription_status === 'trialing'
        ? TRIAL_DOCTOR_CAP
        : getEffectiveDoctorLimit(
            (clinicRes.data.subscription_tier ?? 'clinic') as SubscriptionTier,
            addonRes.data ?? 0
          )

    if (limit === null) return { allowed: true }

    const used = (doctorsRes.data ?? 0) + (pendingRes.count ?? 0)
    if (used < limit) return { allowed: true }

    if (mode === 'log') {
      console.warn(`[billing seats] WOULD BLOCK doctor invite for clinic ${clinicId} (${used}/${limit})`)
      return { allowed: true }
    }

    return {
      allowed: false,
      error: `Your plan allows ${limit} doctor${limit === 1 ? '' : 's'}, including pending invitations. Upgrade your plan or add seats to invite more.`,
    }
  } catch (err) {
    console.error('[billing seats] unexpected error, allowing:', err)
    return { allowed: true }
  }
}