BEGIN;

-- ============================================================
-- list_my_family_cards_with_doctor() (Chat 21 — bug-fix round)
--
-- Purpose-built for the appointment-request dropdown, which needs
-- the assigned doctor's name alongside clinic + patient name. Kept
-- separate from list_my_family_patient_cards() (used by Home,
-- Card Detail, Consents) to avoid changing that function's return
-- shape and risking regressions in already-working pages.
-- ============================================================

CREATE OR REPLACE FUNCTION public.list_my_family_cards_with_doctor()
RETURNS TABLE (
  id uuid,
  first_name character varying,
  last_name character varying,
  clinic_name character varying,
  doctor_name character varying
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    p.id,
    p.first_name,
    p.last_name,
    c.name,
    pr.full_name
  FROM patients p
  JOIN clinics c ON c.id = p.clinic_id
  LEFT JOIN profiles pr ON pr.id = p.assigned_doctor_id
  WHERE p.family_account_id = get_my_family_account_id()
    AND p.deleted_at IS NULL
  ORDER BY p.created_at DESC
$$;

GRANT EXECUTE ON FUNCTION public.list_my_family_cards_with_doctor() TO authenticated;

COMMIT;