-- ============================================================================
-- Catalogue-backed prescribing (Chat B, objective 3)
--
-- Adds a nullable FK from prescriptions to pharmacy_drugs. Doctors can still
-- free-type a medicine name (per product decision: free text is allowed when
-- a medicine isn't stocked, or the patient gets a handwritten prescription
-- for an external pharmacy — that's out of scope and fine). When the doctor
-- selects from the catalogue via the wizard's autocomplete/picker, drug_id
-- is set, and the pharmacy queue can match on it directly instead of relying
-- on exact-name string matching.
--
-- ON DELETE RESTRICT mirrors pharmacy_dispensations.prescription_id — drugs
-- are soft-deleted (is_active=false) in this app, never hard-deleted, but
-- RESTRICT is the safe default if that ever happens outside the app layer.
-- ============================================================================

ALTER TABLE public.prescriptions
  ADD COLUMN IF NOT EXISTS drug_id uuid REFERENCES public.pharmacy_drugs(id) ON DELETE RESTRICT;

COMMENT ON COLUMN public.prescriptions.drug_id IS
  'Optional catalogue reference (pharmacy_drugs.id). Null for free-text prescriptions of medicines not in the clinic''s pharmacy catalogue. When set, the pharmacy queue matches on this directly instead of name-matching.';

CREATE INDEX IF NOT EXISTS idx_prescriptions_drug_id
  ON public.prescriptions(drug_id)
  WHERE drug_id IS NOT NULL;

-- No RLS policy change needed: drug_id is just a new nullable column on an
-- existing row, already covered by prescriptions' existing clinic-scoped
-- INSERT/SELECT policies.