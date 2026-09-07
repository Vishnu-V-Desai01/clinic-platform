BEGIN;

-- ============================================================================
-- Pharmacy bundled into every tier — no longer a paid add-on
--
-- Product decision changed after the pharmacy feature was originally built
-- (20260822180100_pharmacy_core_tables.sql, "Rs 4,000/yr add-on gate"):
-- pricing.ts now states plainly that "every tier includes every feature
-- (patient portal, care plans, reminders, analytics, pharmacy). There is no
-- feature gating and no add-on pricing." The database default and existing
-- rows were never updated to match — every clinic created since that
-- pricing decision, and every clinic created before it, still has
-- clinics.pharmacy_enabled = false, and there was never an admin-facing
-- control to change it (confirmed: no UI, no server action anywhere
-- updates this column). Reported symptom: brand-new clinics don't see the
-- Pharmacy sidebar item.
--
-- Both places that gate on this column read it correctly today — the fix
-- is purely a data-layer change, not an application code change:
--   1. src/app/(app)/layout.tsx queries clinics.pharmacy_enabled directly
--      and passes it to AppSidebar as the pharmacyEnabled prop that
--      controls sidebar visibility.
--   2. pharmacy_enabled_for_my_clinic() (20260822180100) is
--      COALESCE(clinics.pharmacy_enabled, false) — a straight read of the
--      same column, referenced by every pharmacy RLS policy and by
--      pharmacy_dispense(). No function body change needed; it inherits
--      the new default/backfilled data automatically.
--
-- The column and every policy/function referencing it are left in place
-- (additive-only) rather than ripped out — this keeps the change to
-- exactly the two things that were actually wrong (default + existing
-- data), with no risk introduced by rewriting nine call sites across six
-- migration files for a purely cosmetic simplification.
-- ============================================================================

ALTER TABLE public.clinics
  ALTER COLUMN pharmacy_enabled SET DEFAULT true;

COMMENT ON COLUMN public.clinics.pharmacy_enabled IS
  'Pharmacy module flag. Bundled into every tier as of this migration — new clinics default to true. Retained (not dropped) because pharmacy_enabled_for_my_clinic() and every pharmacy RLS policy still read it; additive-only migration policy.';

-- Backfill: every clinic that existed before this migration — regardless
-- of when it was created — gets pharmacy switched on. Not scoped to "new"
-- clinics only: the add-on model never had a real enable path, so no
-- existing clinic's false value represents a deliberate choice to keep
-- pharmacy off. Idempotent — only touches rows not already true.
UPDATE public.clinics
SET pharmacy_enabled = true
WHERE pharmacy_enabled = false;

COMMIT;