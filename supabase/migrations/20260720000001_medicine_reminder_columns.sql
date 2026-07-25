-- supabase/migrations/20260720000001_medicine_reminder_columns.sql
--
-- Adds medicine-specific columns to care_plan_reminders.
-- Additive only — no existing columns changed or dropped.
-- Existing generic reminder rows are unaffected (new columns default to NULL).

ALTER TABLE care_plan_reminders
  ADD COLUMN IF NOT EXISTS medicine_name    TEXT,
  ADD COLUMN IF NOT EXISTS reminder_time    TEXT,
  ADD COLUMN IF NOT EXISTS meal_association TEXT,
  ADD COLUMN IF NOT EXISTS duration_days    INTEGER,
  ADD COLUMN IF NOT EXISTS last_sent_at     TIMESTAMPTZ;

COMMENT ON COLUMN care_plan_reminders.medicine_name
  IS 'Medicine being reminded — denormalized for message generation';
COMMENT ON COLUMN care_plan_reminders.reminder_time
  IS 'HH:MM 24-hour IST — the exact time to send the WhatsApp reminder each day';
COMMENT ON COLUMN care_plan_reminders.meal_association
  IS 'Optional meal context shown in the message, e.g. before_breakfast, after_lunch';
COMMENT ON COLUMN care_plan_reminders.duration_days
  IS 'How many days to send — NULL means ongoing until manually disabled';
COMMENT ON COLUMN care_plan_reminders.last_sent_at
  IS 'Timestamp of most recent successful send — prevents duplicate sends on same day';