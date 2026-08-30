-- supabase/migrations/20260830120000_update_message_quota_pricing.sql
--
-- Item 8: revise message quota economics.
--   included_limit      250 -> 700 messages/month
--   overage_rate_paise  150 -> 75  (Rs 1.50 -> Rs 0.75 per message)
--
-- Column defaults changed so every future clinic/month (first insert
-- via trg_increment_message_usage) picks up the new numbers
-- automatically. Existing CURRENT-MONTH rows that are NOT YET
-- settled (is_settled = false) are updated in place too, since an
-- unsettled month has not been invoiced yet -- there is no "past
-- month" to protect. Already-settled rows are deliberately left
-- untouched: overage_rate_paise is a per-row historical snapshot
-- (see original table comment) and a settled month has already been
-- billed at its old rate.

ALTER TABLE clinic_message_usage
  ALTER COLUMN included_limit SET DEFAULT 700;

ALTER TABLE clinic_message_usage
  ALTER COLUMN overage_rate_paise SET DEFAULT 75;

UPDATE clinic_message_usage
SET included_limit = 700,
    overage_rate_paise = 75,
    updated_at = now()
WHERE is_settled = false
  AND (included_limit <> 700 OR overage_rate_paise <> 75);

COMMENT ON COLUMN clinic_message_usage.included_limit IS
  'Messages included before overage billing applies. Snapshot per row (like overage_rate_paise) so settled/past months are unaffected if pricing changes later. Current default: 700/month.';
COMMENT ON COLUMN clinic_message_usage.overage_rate_paise IS
  'Snapshot of the per-message overage rate in paise at the time (75 = Rs 0.75). Stored per-row so past months are unaffected if pricing changes later.';