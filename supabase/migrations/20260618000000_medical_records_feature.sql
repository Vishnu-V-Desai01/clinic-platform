-- =============================================================
-- Medical Records Feature — Encounter-grouped (Model A)
-- FHIR-ready: nullable code + code_system on all clinical rows
-- No DELETE policies: medical records are a permanent audit trail
-- =============================================================

-- ---------------------------------------------------------------
-- 1. ENCOUNTERS
-- One row per doctor-patient consultation session
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS encounters (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id        UUID        NOT NULL,
  patient_id       UUID        NOT NULL REFERENCES patients(id)  ON DELETE RESTRICT,
  doctor_id        UUID        NOT NULL REFERENCES profiles(id)  ON DELETE RESTRICT,
  encounter_date   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  chief_complaint  TEXT,
  notes            TEXT,
  status           TEXT        NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active', 'completed', 'cancelled')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------
-- 2. DIAGNOSES
-- Discrete diagnosis/condition rows per encounter
-- code + code_system nullable: ready for ICD-10 / SNOMED-CT
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS diagnoses (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       UUID        NOT NULL,
  encounter_id    UUID        NOT NULL REFERENCES encounters(id) ON DELETE RESTRICT,
  patient_id      UUID        NOT NULL REFERENCES patients(id)   ON DELETE RESTRICT,
  condition_name  TEXT        NOT NULL,
  code            TEXT,
  code_system     TEXT,
  severity        TEXT        CHECK (severity IN ('mild', 'moderate', 'severe')),
  status          TEXT        NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'resolved', 'inactive')),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------
-- 3. OBSERVATIONS
-- Discrete vital / measurement rows per encounter
-- code + code_system nullable: ready for LOINC
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS observations (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id        UUID        NOT NULL,
  encounter_id     UUID        NOT NULL REFERENCES encounters(id) ON DELETE RESTRICT,
  patient_id       UUID        NOT NULL REFERENCES patients(id)   ON DELETE RESTRICT,
  observation_type TEXT        NOT NULL,
  value            TEXT        NOT NULL,
  unit             TEXT,
  code             TEXT,
  code_system      TEXT,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------
-- 4. PRESCRIPTIONS
-- Discrete medication rows per encounter
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS prescriptions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       UUID        NOT NULL,
  encounter_id    UUID        NOT NULL REFERENCES encounters(id) ON DELETE RESTRICT,
  patient_id      UUID        NOT NULL REFERENCES patients(id)   ON DELETE RESTRICT,
  medicine_name   TEXT        NOT NULL,
  dosage          TEXT,
  frequency       TEXT,
  duration        TEXT,
  instructions    TEXT,
  status          TEXT        NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'stopped', 'completed')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------
-- 5. TEST RESULTS
-- Lab / imaging results linked to an ordering encounter
-- code + code_system nullable: ready for LOINC / SNOMED-CT
-- Staff can insert/update when results arrive from lab
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS test_results (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       UUID        NOT NULL,
  encounter_id    UUID        NOT NULL REFERENCES encounters(id) ON DELETE RESTRICT,
  patient_id      UUID        NOT NULL REFERENCES patients(id)   ON DELETE RESTRICT,
  test_name       TEXT        NOT NULL,
  result_value    TEXT,
  result_text     TEXT,
  reference_range TEXT,
  is_abnormal     BOOLEAN     NOT NULL DEFAULT FALSE,
  status          TEXT        NOT NULL DEFAULT 'ordered'
                    CHECK (status IN ('ordered', 'pending', 'completed')),
  code            TEXT,
  code_system     TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================
-- INDEXES
-- =============================================================
CREATE INDEX IF NOT EXISTS idx_encounters_patient_id      ON encounters(patient_id);
CREATE INDEX IF NOT EXISTS idx_encounters_doctor_id       ON encounters(doctor_id);
CREATE INDEX IF NOT EXISTS idx_encounters_clinic_id       ON encounters(clinic_id);
CREATE INDEX IF NOT EXISTS idx_encounters_date            ON encounters(encounter_date DESC);

CREATE INDEX IF NOT EXISTS idx_diagnoses_encounter_id     ON diagnoses(encounter_id);
CREATE INDEX IF NOT EXISTS idx_diagnoses_patient_id       ON diagnoses(patient_id);
CREATE INDEX IF NOT EXISTS idx_diagnoses_clinic_id        ON diagnoses(clinic_id);

CREATE INDEX IF NOT EXISTS idx_observations_encounter_id  ON observations(encounter_id);
CREATE INDEX IF NOT EXISTS idx_observations_patient_id    ON observations(patient_id);
CREATE INDEX IF NOT EXISTS idx_observations_clinic_id     ON observations(clinic_id);

CREATE INDEX IF NOT EXISTS idx_prescriptions_encounter_id ON prescriptions(encounter_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_patient_id   ON prescriptions(patient_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_clinic_id    ON prescriptions(clinic_id);

CREATE INDEX IF NOT EXISTS idx_test_results_encounter_id  ON test_results(encounter_id);
CREATE INDEX IF NOT EXISTS idx_test_results_patient_id    ON test_results(patient_id);
CREATE INDEX IF NOT EXISTS idx_test_results_clinic_id     ON test_results(clinic_id);

-- =============================================================
-- updated_at TRIGGERS
-- CREATE OR REPLACE is safe if this function already exists
-- from a previous migration
-- =============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_encounters_updated_at
  BEFORE UPDATE ON encounters
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_diagnoses_updated_at
  BEFORE UPDATE ON diagnoses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_observations_updated_at
  BEFORE UPDATE ON observations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_prescriptions_updated_at
  BEFORE UPDATE ON prescriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_test_results_updated_at
  BEFORE UPDATE ON test_results
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================
-- ROW LEVEL SECURITY
-- =============================================================
ALTER TABLE encounters    ENABLE ROW LEVEL SECURITY;
ALTER TABLE diagnoses     ENABLE ROW LEVEL SECURITY;
ALTER TABLE observations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE prescriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_results  ENABLE ROW LEVEL SECURITY;

-- ENCOUNTERS --------------------------------------------------
-- Doctor: full create/read/update
-- Staff:  read-only
CREATE POLICY "encounters_select" ON encounters
  FOR SELECT USING (
    clinic_id = get_my_clinic_id()
    AND get_my_role() IN ('doctor', 'staff')
  );

CREATE POLICY "encounters_insert" ON encounters
  FOR INSERT WITH CHECK (
    clinic_id = get_my_clinic_id()
    AND get_my_role() = 'doctor'
  );

CREATE POLICY "encounters_update" ON encounters
  FOR UPDATE USING (
    clinic_id = get_my_clinic_id()
    AND get_my_role() = 'doctor'
  );

-- DIAGNOSES ---------------------------------------------------
CREATE POLICY "diagnoses_select" ON diagnoses
  FOR SELECT USING (
    clinic_id = get_my_clinic_id()
    AND get_my_role() IN ('doctor', 'staff')
  );

CREATE POLICY "diagnoses_insert" ON diagnoses
  FOR INSERT WITH CHECK (
    clinic_id = get_my_clinic_id()
    AND get_my_role() = 'doctor'
  );

CREATE POLICY "diagnoses_update" ON diagnoses
  FOR UPDATE USING (
    clinic_id = get_my_clinic_id()
    AND get_my_role() = 'doctor'
  );

-- OBSERVATIONS ------------------------------------------------
CREATE POLICY "observations_select" ON observations
  FOR SELECT USING (
    clinic_id = get_my_clinic_id()
    AND get_my_role() IN ('doctor', 'staff')
  );

CREATE POLICY "observations_insert" ON observations
  FOR INSERT WITH CHECK (
    clinic_id = get_my_clinic_id()
    AND get_my_role() = 'doctor'
  );

CREATE POLICY "observations_update" ON observations
  FOR UPDATE USING (
    clinic_id = get_my_clinic_id()
    AND get_my_role() = 'doctor'
  );

-- PRESCRIPTIONS -----------------------------------------------
CREATE POLICY "prescriptions_select" ON prescriptions
  FOR SELECT USING (
    clinic_id = get_my_clinic_id()
    AND get_my_role() IN ('doctor', 'staff')
  );

CREATE POLICY "prescriptions_insert" ON prescriptions
  FOR INSERT WITH CHECK (
    clinic_id = get_my_clinic_id()
    AND get_my_role() = 'doctor'
  );

CREATE POLICY "prescriptions_update" ON prescriptions
  FOR UPDATE USING (
    clinic_id = get_my_clinic_id()
    AND get_my_role() = 'doctor'
  );

-- TEST RESULTS ------------------------------------------------
-- Staff can insert/update when lab results arrive
CREATE POLICY "test_results_select" ON test_results
  FOR SELECT USING (
    clinic_id = get_my_clinic_id()
    AND get_my_role() IN ('doctor', 'staff')
  );

CREATE POLICY "test_results_insert" ON test_results
  FOR INSERT WITH CHECK (
    clinic_id = get_my_clinic_id()
    AND get_my_role() IN ('doctor', 'staff')
  );

CREATE POLICY "test_results_update" ON test_results
  FOR UPDATE USING (
    clinic_id = get_my_clinic_id()
    AND get_my_role() IN ('doctor', 'staff')
  );