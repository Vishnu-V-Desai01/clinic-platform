-- Item 7a: doctor-scoped saved snippets for clinical notes.
-- Decision (confirmed): doctor-scoped only, no clinic-sharing, no admin
-- override — a doctor manages and sees exclusively their own snippets.
CREATE TABLE IF NOT EXISTS clinical_note_snippets (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id),
  doctor_id uuid not null references profiles(id),
  title text not null,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS idx_clinical_note_snippets_doctor
  ON clinical_note_snippets(doctor_id);

ALTER TABLE clinical_note_snippets ENABLE ROW LEVEL SECURITY;

-- Assumes profiles.id = auth.uid() (the convention used throughout this
-- codebase for doctor_id/created_by columns elsewhere) — verify this
-- holds when testing, since it's the entire security boundary here.
DROP POLICY IF EXISTS clinical_note_snippets_select ON clinical_note_snippets;
CREATE POLICY clinical_note_snippets_select ON clinical_note_snippets
  FOR SELECT
  USING (doctor_id = auth.uid());

DROP POLICY IF EXISTS clinical_note_snippets_insert ON clinical_note_snippets;
CREATE POLICY clinical_note_snippets_insert ON clinical_note_snippets
  FOR INSERT
  WITH CHECK (doctor_id = auth.uid());

DROP POLICY IF EXISTS clinical_note_snippets_update ON clinical_note_snippets;
CREATE POLICY clinical_note_snippets_update ON clinical_note_snippets
  FOR UPDATE
  USING (doctor_id = auth.uid())
  WITH CHECK (doctor_id = auth.uid());

DROP POLICY IF EXISTS clinical_note_snippets_delete ON clinical_note_snippets;
CREATE POLICY clinical_note_snippets_delete ON clinical_note_snippets
  FOR DELETE
  USING (doctor_id = auth.uid());