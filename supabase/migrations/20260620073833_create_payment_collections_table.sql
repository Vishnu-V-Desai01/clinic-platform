-- ============================================================================
-- Chat 10: Payments feature — create payment_collections table
-- ============================================================================

-- A. Create the payment_collections table
-- One row per collection event; cumulative sum updates amount_paid on payments.
CREATE TABLE IF NOT EXISTS payment_collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  payment_id uuid NOT NULL REFERENCES payments(id),
  
  -- Collection details
  amount_collected numeric(10, 2) NOT NULL CHECK (amount_collected > 0),
  collection_date timestamptz NOT NULL DEFAULT now(),
  payment_method text NOT NULL 
    CHECK (payment_method IN ('cash', 'card', 'upi', 'bank_transfer', 'check', 'other')),
  transaction_reference text, -- e.g., UPI ID, check number, invoice ref
  collected_by uuid NOT NULL REFERENCES profiles(id),
  notes text,
  
  -- Audit
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- B. Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_payment_collections_payment_id 
  ON payment_collections(payment_id);

CREATE INDEX IF NOT EXISTS idx_payment_collections_clinic_date 
  ON payment_collections(clinic_id, collection_date);

CREATE INDEX IF NOT EXISTS idx_payment_collections_collected_by 
  ON payment_collections(collected_by);

-- C. Enable RLS on payment_collections table
ALTER TABLE payment_collections ENABLE ROW LEVEL SECURITY;

-- D. RLS Policies: doctors and staff can read/write collections for their clinic
DROP POLICY IF EXISTS "payment_collections_select_clinic_staff_doctor" ON payment_collections;
CREATE POLICY "payment_collections_select_clinic_staff_doctor" ON payment_collections
  FOR SELECT TO authenticated
  USING (
    clinic_id = get_my_clinic_id()
    AND get_my_role() IN ('doctor', 'staff')
  );

DROP POLICY IF EXISTS "payment_collections_insert_clinic_staff_doctor" ON payment_collections;
CREATE POLICY "payment_collections_insert_clinic_staff_doctor" ON payment_collections
  FOR INSERT TO authenticated
  WITH CHECK (
    clinic_id = get_my_clinic_id()
    AND get_my_role() IN ('doctor', 'staff')
  );

DROP POLICY IF EXISTS "payment_collections_update_clinic_staff_doctor" ON payment_collections;
CREATE POLICY "payment_collections_update_clinic_staff_doctor" ON payment_collections
  FOR UPDATE TO authenticated
  USING (
    clinic_id = get_my_clinic_id()
    AND get_my_role() IN ('doctor', 'staff')
  )
  WITH CHECK (
    clinic_id = get_my_clinic_id()
    AND get_my_role() IN ('doctor', 'staff')
  );

-- E. Trigger: update amount_paid on payments table (cumulative sum)
-- This keeps payments.amount_paid and generated columns in sync automatically.
CREATE OR REPLACE FUNCTION trigger_update_payment_amount_paid()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_collected numeric(10, 2);
BEGIN
  -- Calculate cumulative sum of all collections for this payment
  SELECT COALESCE(SUM(amount_collected), 0)
  INTO v_total_collected
  FROM payment_collections
  WHERE payment_id = (CASE WHEN TG_OP = 'DELETE' THEN OLD.payment_id ELSE NEW.payment_id END);

  -- Update the payment record (idempotent; generated columns recalculate automatically)
  UPDATE payments
  SET amount_paid = v_total_collected, updated_at = now()
  WHERE id = (CASE WHEN TG_OP = 'DELETE' THEN OLD.payment_id ELSE NEW.payment_id END);

  RETURN (CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END);
END;
$$;

DROP TRIGGER IF EXISTS trg_update_payment_amount_paid_insert ON payment_collections;
CREATE TRIGGER trg_update_payment_amount_paid_insert
  AFTER INSERT ON payment_collections
  FOR EACH ROW
  EXECUTE FUNCTION trigger_update_payment_amount_paid();

DROP TRIGGER IF EXISTS trg_update_payment_amount_paid_update ON payment_collections;
CREATE TRIGGER trg_update_payment_amount_paid_update
  AFTER UPDATE ON payment_collections
  FOR EACH ROW
  EXECUTE FUNCTION trigger_update_payment_amount_paid();

DROP TRIGGER IF EXISTS trg_update_payment_amount_paid_delete ON payment_collections;
CREATE TRIGGER trg_update_payment_amount_paid_delete
  AFTER DELETE ON payment_collections
  FOR EACH ROW
  EXECUTE FUNCTION trigger_update_payment_amount_paid();