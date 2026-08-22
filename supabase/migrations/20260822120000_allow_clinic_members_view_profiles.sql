-- Allow any authenticated clinic member to see other profiles within
-- their own clinic. Needed for doctor-picker dropdowns (Book Appointment,
-- New Charge, staff-dashboard confirm flow) used by staff and non-admin
-- doctors alike -- the existing policies only covered "view own row" and
-- "admin views everyone."
--
-- Applied live in Supabase SQL Editor on 2026-08-22; this migration
-- backfills it into tracked history. DROP IF EXISTS + CREATE makes it
-- safe to re-run, since CREATE POLICY has no IF NOT EXISTS clause.
DROP POLICY IF EXISTS "profiles_clinic_members_view_each_other" ON profiles;

CREATE POLICY "profiles_clinic_members_view_each_other" ON profiles
  FOR SELECT
  TO authenticated
  USING (
    clinic_id = get_my_clinic_id()
  );