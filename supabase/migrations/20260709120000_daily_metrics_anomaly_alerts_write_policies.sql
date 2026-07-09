-- Chat 14, Step 1b: daily_metrics and anomaly_alerts were created with a
-- SELECT-only RLS policy each (Chat 13). No INSERT/UPDATE/DELETE policy
-- existed on either table, so every write from runDailyRollup() /
-- upsertDailyMetric() / upsertAnomalyAlert() / clearAnomalyAlert() was
-- silently default-denied by Postgres RLS. This went undetected because
-- no UI ever actually called runDailyRollup() until the dev-only manual
-- trigger button (Chat 14) surfaced it.
--
-- get_my_clinic_id() and get_my_role() already exist; this adds the
-- missing third helper (get_my_profile_id()) following the identical
-- pattern, then uses all three to scope the write policies to exactly
-- what actions.ts already enforces in application code: the caller must
-- be a doctor, writing only to their own clinic_id + doctor_id rows.

CREATE OR REPLACE FUNCTION public.get_my_profile_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT id FROM profiles WHERE clerk_user_id = (auth.jwt()->>'sub')
$function$;

-- ── daily_metrics ────────────────────────────────────────────────────────
-- Only ever written by the doctor rolling up their own day (upsertDailyMetric
-- does a manual find-then-write, never a raw upsert — see actions.ts comment
-- on why, re: partial unique indexes). No DELETE path exists in code, so no
-- DELETE policy is added.

CREATE POLICY daily_metrics_insert ON daily_metrics
FOR INSERT
WITH CHECK (
  clinic_id = get_my_clinic_id()
  AND doctor_id = get_my_profile_id()
  AND get_my_role() = 'doctor'
);

CREATE POLICY daily_metrics_update ON daily_metrics
FOR UPDATE
USING (
  clinic_id = get_my_clinic_id()
  AND doctor_id = get_my_profile_id()
  AND get_my_role() = 'doctor'
)
WITH CHECK (
  clinic_id = get_my_clinic_id()
  AND doctor_id = get_my_profile_id()
  AND get_my_role() = 'doctor'
);

-- ── anomaly_alerts ───────────────────────────────────────────────────────
-- evaluateAnomaliesForDay both writes (upsertAnomalyAlert) and deletes
-- (clearAnomalyAlert, when an alert no longer applies) — needs all three.

CREATE POLICY anomaly_alerts_insert ON anomaly_alerts
FOR INSERT
WITH CHECK (
  clinic_id = get_my_clinic_id()
  AND doctor_id = get_my_profile_id()
  AND get_my_role() = 'doctor'
);

CREATE POLICY anomaly_alerts_update ON anomaly_alerts
FOR UPDATE
USING (
  clinic_id = get_my_clinic_id()
  AND doctor_id = get_my_profile_id()
  AND get_my_role() = 'doctor'
)
WITH CHECK (
  clinic_id = get_my_clinic_id()
  AND doctor_id = get_my_profile_id()
  AND get_my_role() = 'doctor'
);

CREATE POLICY anomaly_alerts_delete ON anomaly_alerts
FOR DELETE
USING (
  clinic_id = get_my_clinic_id()
  AND doctor_id = get_my_profile_id()
  AND get_my_role() = 'doctor'
);