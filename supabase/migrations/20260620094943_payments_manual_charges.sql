-- ============================================================================
-- Chat 10: Payments feature — support manual (non-appointment) charges
-- ============================================================================

-- A. Allow payments without a linked appointment (e.g., walk-ins, lab-only visits)
ALTER TABLE payments ALTER COLUMN appointment_id DROP NOT NULL;

-- B. Add a description column to label manual charges (used as the "service"
--    shown in the UI when there's no appointment to pull a type/date from)
ALTER TABLE payments ADD COLUMN IF NOT EXISTS description TEXT;

-- C. Enforce that every manual charge has a description (appointment-linked
--    charges can rely on the appointment's type instead)
ALTER TABLE payments DROP CONSTRAINT IF EXISTS manual_charge_requires_description;
ALTER TABLE payments ADD CONSTRAINT manual_charge_requires_description
  CHECK (appointment_id IS NOT NULL OR description IS NOT NULL);

-- NOTE: the existing UNIQUE (appointment_id, clinic_id) constraint is
-- unaffected — Postgres treats each NULL as distinct, so multiple manual
-- charges (appointment_id = NULL) for the same clinic do not collide.