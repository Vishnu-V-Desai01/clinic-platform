ALTER TABLE encounters
  ADD COLUMN IF NOT EXISTS appointment_id uuid REFERENCES appointments(id),
  ADD COLUMN IF NOT EXISTS last_edited_by uuid REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS last_edited_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_encounters_appointment_id ON encounters(appointment_id);