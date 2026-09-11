-- =============================================================
-- Phase 1: Treatment Details on the Encounter
-- Additive migration — new child table only, mirrors the
-- diagnoses/observations pattern from
-- 20260618000000_medical_records_feature.sql (Model A).
-- No DELETE policy — medical records are a permanent audit
-- trail, same as diagnoses/observations/prescriptions/
-- test_results in that migration.
-- =============================================================

CREATE TABLE IF NOT EXISTS encounter_treatments (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       UUID        NOT NULL,
  encounter_id    UUID        NOT NULL REFERENCES encounters(id) ON DELETE RESTRICT,
  patient_id      UUID        NOT NULL REFERENCES patients(id)   ON DELETE RESTRICT,
  treatment_name  TEXT        NOT NULL,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------
-- INDEXES
-- ---------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_encounter_treatments_encounter_id ON encounter_treatments(encounter_id);
CREATE INDEX IF NOT EXISTS idx_encounter_treatments_patient_id   ON encounter_treatments(patient_id);
CREATE INDEX IF NOT EXISTS idx_encounter_treatments_clinic_id    ON encounter_treatments(clinic_id);

-- ---------------------------------------------------------------
-- updated_at TRIGGER
-- Reuses update_updated_at_column(), created in
-- 20260618000000_medical_records_feature.sql — CREATE OR REPLACE
-- there makes it safe to depend on here.
-- ---------------------------------------------------------------
CREATE TRIGGER update_encounter_treatments_updated_at
  BEFORE UPDATE ON encounter_treatments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------
-- ROW LEVEL SECURITY
-- Mirrors diagnoses/observations exactly: clinic-shared SELECT
-- (doctor + staff can view), doctor-only INSERT/UPDATE.
-- Uses get_my_clinic_id() / get_my_role() — never auth.uid()
-- directly (auth.uid() is Clerk's raw JWT subject, not the
-- internal profile UUID — see engineering-learnings).
-- ---------------------------------------------------------------
ALTER TABLE encounter_treatments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "encounter_treatments_select" ON encounter_treatments
  FOR SELECT USING (
    clinic_id = get_my_clinic_id()
    AND get_my_role() IN ('doctor', 'staff')
  );

CREATE POLICY "encounter_treatments_insert" ON encounter_treatments
  FOR INSERT WITH CHECK (
    clinic_id = get_my_clinic_id()
    AND get_my_role() = 'doctor'
  );

CREATE POLICY "encounter_treatments_update" ON encounter_treatments
  FOR UPDATE USING (
    clinic_id = get_my_clinic_id()
    AND get_my_role() = 'doctor'
  );