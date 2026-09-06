-- Corrects clinical_note_snippets' RLS policies from the previous
-- migration (20260906125308), which wrongly used auth.uid() — that
-- returns the raw Clerk JWT subject (e.g. "user_3F9fw..."), not the
-- internal profiles.id uuid, since this project authenticates via Clerk,
-- not Supabase Auth. Uses the project's existing get_my_profile_id() /
-- get_my_clinic_id() helpers instead, matching the identical pattern
-- already established for daily_metrics / anomaly_alerts.

DROP POLICY IF EXISTS clinical_note_snippets_select ON clinical_note_snippets;
CREATE POLICY clinical_note_snippets_select ON clinical_note_snippets
  FOR SELECT
  USING (
    doctor_id = get_my_profile_id()
    AND clinic_id = get_my_clinic_id()
  );

DROP POLICY IF EXISTS clinical_note_snippets_insert ON clinical_note_snippets;
CREATE POLICY clinical_note_snippets_insert ON clinical_note_snippets
  FOR INSERT
  WITH CHECK (
    doctor_id = get_my_profile_id()
    AND clinic_id = get_my_clinic_id()
  );

DROP POLICY IF EXISTS clinical_note_snippets_update ON clinical_note_snippets;
CREATE POLICY clinical_note_snippets_update ON clinical_note_snippets
  FOR UPDATE
  USING (
    doctor_id = get_my_profile_id()
    AND clinic_id = get_my_clinic_id()
  )
  WITH CHECK (
    doctor_id = get_my_profile_id()
    AND clinic_id = get_my_clinic_id()
  );

DROP POLICY IF EXISTS clinical_note_snippets_delete ON clinical_note_snippets;
CREATE POLICY clinical_note_snippets_delete ON clinical_note_snippets
  FOR DELETE
  USING (
    doctor_id = get_my_profile_id()
    AND clinic_id = get_my_clinic_id()
  );