import { GRACE_PERIOD_DAYS } from './pricing'

export type AccessState = 'trialing' | 'active' | 'past_due' | 'expired'

export interface ClinicAccessInput {
  subscription_status: string | null
  trial_ends_at: string | null
  current_period_end: string | null
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * A clinic's effective access state, derived from dates so no scheduled
 * job has to flip a status.
 *
 * - trialing: full access until trial_ends_at, then expired (no grace)
 * - active: full access until current_period_end, then past_due for
 *   GRACE_PERIOD_DAYS (still full access), then expired
 * - anything else (expired, cancelled, unknown): expired
 *
 * A missing end date is treated as not-yet-ended. The webhook and the
 * onboarding function always set these dates, so a gap means bad data,
 * and locking out a paying clinic is the worse mistake.
 */
export function computeAccessState(
  clinic: ClinicAccessInput,
  now: Date = new Date()
): AccessState {
  const t = now.getTime()

  if (clinic.subscription_status === 'trialing') {
    const end = clinic.trial_ends_at ? Date.parse(clinic.trial_ends_at) : NaN
    return Number.isNaN(end) || t <= end ? 'trialing' : 'expired'
  }

  if (clinic.subscription_status === 'active') {
    const end = clinic.current_period_end ? Date.parse(clinic.current_period_end) : NaN
    if (Number.isNaN(end) || t <= end) return 'active'
    if (t <= end + GRACE_PERIOD_DAYS * DAY_MS) return 'past_due'
    return 'expired'
  }

  return 'expired'
}

/** Expired clinics keep read and edit access but cannot create new records. */
export function canCreateRecords(state: AccessState): boolean {
  return state !== 'expired'
}