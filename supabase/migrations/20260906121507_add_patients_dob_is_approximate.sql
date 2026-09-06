-- Additive: tracks whether date_of_birth was entered exactly by staff/doctor
-- or derived from an approximate Age entry (Item 6). Does not change any
-- existing row's data_of_birth value or behavior — defaults false, meaning
-- every existing patient's DOB is treated as exact, which is correct since
-- approximate-age entry didn't exist before this migration.
ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS dob_is_approximate boolean NOT NULL DEFAULT false;