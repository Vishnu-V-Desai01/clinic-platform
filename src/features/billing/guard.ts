import { createServiceSupabaseClient } from '@/lib/supabase/service'
import { canCreateRecords, computeAccessState } from './access'

export type EnforcementMode = 'off' | 'log' | 'on'

export const EXPIRED_CREATE_MESSAGE =
  'Your clinic’s subscription has expired. You can still view and edit existing records, but you cannot create new ones until the plan is renewed.'

/** off = do nothing, log = record would-be blocks only, on = block. */
export function getEnforcementMode(): EnforcementMode {
  const v = process.env.BILLING_ENFORCEMENT
  return v === 'on' || v === 'log' ? v : 'off'
}

export type CreateGuardResult = { allowed: true } | { allowed: false; error: string }

/**
 * Call at the top of any server action that creates a new record.
 * Fails open: if the clinic cannot be read, the action proceeds.
 */
export async function checkClinicCanCreate(
  clinicId: string,
  action: string
): Promise<CreateGuardResult> {
  const mode = getEnforcementMode()
  if (mode === 'off') return { allowed: true }

  try {
    const supabase = createServiceSupabaseClient()
    const { data, error } = await supabase
      .from('clinics')
      .select('subscription_status, trial_ends_at, current_period_end')
      .eq('id', clinicId)
      .maybeSingle()

    if (error || !data) {
      console.error('[billing guard] clinic lookup failed, allowing:', clinicId, error)
      return { allowed: true }
    }

    const state = computeAccessState(data)
    if (canCreateRecords(state)) return { allowed: true }

    if (mode === 'log') {
      console.warn(`[billing guard] WOULD BLOCK ${action} for clinic ${clinicId} (state=${state})`)
      return { allowed: true }
    }

    return { allowed: false, error: EXPIRED_CREATE_MESSAGE }
  } catch (err) {
    console.error('[billing guard] unexpected error, allowing:', err)
    return { allowed: true }
  }
}