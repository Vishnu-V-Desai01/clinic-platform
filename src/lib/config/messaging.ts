// src/lib/config/messaging.ts
//
// Single source of truth (app-side) for WhatsApp messaging quota and
// overage pricing. Mirrors the DB column defaults on
// clinic_message_usage (included_limit, overage_rate_paise) — see
// supabase/migrations/20260830120000_update_message_quota_pricing.sql.
// Postgres can't import this file, so the two are kept in sync by
// hand; this module is the reference the migration was written to
// match. If either number changes, change both.
//
// Billing period is unchanged by this update: calendar month,
// computed identically by the trg_increment_message_usage DB trigger
// and the matching query in getClinicMessageUsage() (messaging/actions.ts).
// Both already agree with each other; this module does not
// re-implement that boundary logic, to avoid a second definition that
// could drift out of sync with the trigger.

export const INCLUDED_MESSAGE_LIMIT = 700;
export const OVERAGE_RATE_PAISE = 75; // ₹0.75 per message, in paise

/** Pure overage calculation, for anywhere that needs it without re-deriving the formula. */
export function calculateOverageAmountPaise(
  messagesSent: number,
  includedLimit: number = INCLUDED_MESSAGE_LIMIT,
  overageRatePaise: number = OVERAGE_RATE_PAISE,
): number {
  return Math.max(0, messagesSent - includedLimit) * overageRatePaise;
}