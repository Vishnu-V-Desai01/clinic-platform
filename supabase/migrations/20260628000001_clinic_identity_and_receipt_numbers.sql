-- ============================================================================
-- Chat 10 close: clinic identity fields + atomic receipt numbering
-- ============================================================================

-- A. Add missing identity fields to clinics
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS gst_number        VARCHAR(15);
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS receipt_counter   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS show_branding_footer BOOLEAN NOT NULL DEFAULT true;

-- B. Add receipt_number to payments (frozen at approval time, never changes)
ALTER TABLE payments ADD COLUMN IF NOT EXISTS receipt_number TEXT;

-- C. Atomic function — increments counter and returns formatted receipt number
--    SECURITY DEFINER so RLS doesn't block the counter update
CREATE OR REPLACE FUNCTION next_receipt_number(p_clinic_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_counter integer;
  v_year    text;
BEGIN
  -- Single atomic UPDATE + RETURNING — two simultaneous approvals
  -- can never get the same number
  UPDATE clinics
  SET    receipt_counter = receipt_counter + 1,
         updated_at      = now()
  WHERE  id = p_clinic_id
  RETURNING receipt_counter INTO v_counter;

  v_year := to_char(now(), 'YYYY');

  -- Format: RCP-2026-000042
  RETURN 'RCP-' || v_year || '-' || LPAD(v_counter::text, 6, '0');
END;
$$;