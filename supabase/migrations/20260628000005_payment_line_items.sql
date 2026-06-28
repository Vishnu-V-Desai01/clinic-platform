-- ============================================================================
-- Multi-service billing: payment line items
-- ============================================================================

CREATE TABLE payment_line_items (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id   UUID          NOT NULL REFERENCES clinics(id),
  payment_id  UUID          NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  description TEXT          NOT NULL,
  quantity    INTEGER       NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price  NUMERIC(10,2) NOT NULL CHECK (unit_price >= 0),
  total_price NUMERIC(10,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  sort_order  INTEGER       NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ   DEFAULT now(),
  updated_at  TIMESTAMPTZ
);

-- RLS — same pattern as every other table
ALTER TABLE payment_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "line_items_clinic_access"
  ON payment_line_items FOR ALL
  TO authenticated
  USING  (clinic_id = get_my_clinic_id())
  WITH CHECK (clinic_id = get_my_clinic_id());

-- ── Trigger: keeps payments.amount_charged = SUM of its line items ───────────
-- Only fires on line_items mutations, so old charges without line items
-- are never touched — full backward compatibility.
CREATE OR REPLACE FUNCTION sync_payment_charged_from_items()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_pid   UUID;
  v_total NUMERIC(10,2);
BEGIN
  v_pid := COALESCE(NEW.payment_id, OLD.payment_id);

  SELECT COALESCE(SUM(total_price), 0)
  INTO   v_total
  FROM   payment_line_items
  WHERE  payment_id = v_pid;

  UPDATE payments
  SET    amount_charged = v_total,
         updated_at     = now()
  WHERE  id = v_pid;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_sync_charged_from_items
AFTER INSERT OR UPDATE OR DELETE ON payment_line_items
FOR EACH ROW EXECUTE FUNCTION sync_payment_charged_from_items();