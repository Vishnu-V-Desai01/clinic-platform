BEGIN;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS has_admin_onboarded boolean NOT NULL DEFAULT false;

COMMIT;