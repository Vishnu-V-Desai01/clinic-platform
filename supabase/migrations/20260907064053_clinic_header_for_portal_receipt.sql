BEGIN;

-- ============================================================================
-- get_clinic_header_for_my_payment(uuid)
--
-- CONFIRMED ROOT CAUSE: clinics has exactly one SELECT policy --
-- clinic_members_select_own, USING (id = get_my_clinic_id()). A patient-portal
-- profile has clinic_id = NULL, so get_my_clinic_id() returns NULL and the
-- predicate evaluates to NULL for every row: the query returns ZERO ROWS for
-- ANY clinic id, rather than erroring. receipt/route.ts already queried by
-- payment.clinic_id (the correct id), so the id was never the problem -- the
-- row is simply invisible to a portal caller. `clinic` comes back null, the
-- header falls through to `clinic?.name || 'Clinic'`, and the address,
-- contact and Reg/GST lines are skipped entirely by their if-guards.
--
-- Follows the established pattern (pharmacy_lookup_patient_names,
-- get_document_path_by_token, list_my_family_cards_with_doctor): a narrow
-- SECURITY DEFINER function, NOT a loosened clinics policy.
--
-- ENTITLEMENT: the payment's patient must be linked to the CALLER'S OWN
-- family account. A payment belonging to any other family returns NULL, so a
-- payment id alone grants nothing and no clinic can be enumerated. A clinic
-- user calling this gets NULL too (get_my_family_account_id() is NULL for
-- them), so it opens no cross-clinic path either.
--
-- Returns jsonb rather than RETURNS TABLE deliberately: jsonb_build_object is
-- agnostic to the underlying column types, so this cannot fail at deploy time
-- with "structure of query does not match function result type" if any of the
-- clinics display columns turns out to be text rather than varchar.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_clinic_header_for_my_payment(p_payment_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'name',           c.name,
    'address',        c.address,
    'city',           c.city,
    'state',          c.state,
    'postal_code',    c.postal_code,
    'phone',          c.phone,
    'email',          c.email,
    'license_number', c.license_number,
    'gst_number',     c.gst_number,
    'hfr_id',         c.hfr_id
  )
  FROM public.payments  pay
  JOIN public.patients  p ON p.id = pay.patient_id
  JOIN public.clinics   c ON c.id = pay.clinic_id
  WHERE pay.id = p_payment_id
    AND p.deleted_at IS NULL
    AND p.family_account_id IS NOT NULL
    AND p.family_account_id = public.get_my_family_account_id()
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_clinic_header_for_my_payment(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_clinic_header_for_my_payment(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_clinic_header_for_my_payment(uuid) IS
  'Returns ONLY the clinic display fields needed for a receipt PDF header, for a payment belonging to the calling patient''s own family account. Exists because clinics'' sole SELECT policy is clinic_id-scoped and a portal profile has clinic_id = NULL, making every clinics row invisible to a patient. Narrow SECURITY DEFINER instead of loosening the clinics policy, matching pharmacy_lookup_patient_names and get_document_path_by_token.';

COMMIT;