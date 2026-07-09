-- Chat 14, Step 1b: anomaly_alerts.metric_name had a CHECK constraint
-- limiting values to the original two Chat 13 metrics. Widening
-- AnomalyMetricName in TypeScript (types.ts) never touched this DB-level
-- constraint, so writes for the two new metrics (appointments_no_show,
-- revenue_collected) were rejected outright. Because
-- evaluateAnomaliesForDay's loop in actions.ts has no per-iteration
-- try/catch, that single failure aborted the whole loop — which is why
-- appointments_no_show AND revenue_collected both went silently missing,
-- not just the one that actually violated the constraint.

ALTER TABLE anomaly_alerts DROP CONSTRAINT anomaly_alerts_metric_name_check;

ALTER TABLE anomaly_alerts ADD CONSTRAINT anomaly_alerts_metric_name_check
  CHECK (metric_name IN (
    'appointments_total',
    'appointments_cancelled',
    'appointments_no_show',
    'revenue_collected'
  ));