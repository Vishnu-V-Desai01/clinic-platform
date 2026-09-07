BEGIN;

-- ============================================================================
-- get_patient_receipt_extras_for_my_payment(uuid)
--
-- CONFIRMED ROOT CAUSE (same disease as get_clinic_header_for_my_payment,
-- different tables): receipt/route.ts's payment query joins
-- profiles!created_by(full_name) and, separately, reads payment_line_items.
-- Both joins are subject to the JOINED table's own RLS for the querying
-- role, not the payments row's already-passed ownership check.
--
--   profiles: three SELECT policies, all PERMISSIVE —
--     "Users can view their own profile"   clerk_user_id = auth.jwt()->>'sub'
--     profiles_clinic_members_view_each_other   clinic_id = get_my_clinic_id()
--     profiles_admin_view_clinic_members        clinic_id = get_my_clinic_id() AND admin
--   None of these match a patient (clinic_id IS NULL, not their own row)
--   reading the treating doctor's profile row. The join silently returns
--   nothing rather than erroring, so payment.profiles?.full_name ?? 'N/A'
--   renders "Dr. N/A" on every patient-side receipt.
--
--   payment_line_items: one ALL-commands PERMISSIVE policy,
--     line_items_clinic_access   clinic_id = get_my_clinic_id()
--   Same NULL-for-a-patient problem — the .select() in receipt/route.ts
--   silently returns zero rows for a patient, and hasLineItems's existing
--   fallback renders a single "Consultation"/description line instead of
--   the itemised table the clinic-side copy shows.
--
-- Rather than two more narrow single-purpose functions (mirroring
-- get_document_path_by_token / pharmacy_lookup_patient_names /
-- get_clinic_header_for_my_payment), this single function returns
-- everything the patient-side receipt still needs beyond what
-- get_clinic_header_for_my_payment already supplies: doctor_name and
-- the full line_items array. Consolidated because receipt/route.ts's
-- isPatient branch would otherwise need three RPC round-trips for one
-- PDF; the entitlement predicate is identical across all three so there
-- is no defense-in-depth reason to keep them separate.
--
-- ENTITLEMENT: identical predicate to get_clinic_header_for_my_payment,
-- already verified in production testing — the payment's patient must
-- be linked to the CALLER'S OWN family account. A payment belonging to
-- any other family returns NULL, so a payment id alone grants nothing.
-- A clinic-side caller gets NULL too (get_my_family_account_id() is NULL
-- for them), opening no cross-role path either.
--
-- doctor_name is sourced from payments.created_by, matching the existing
-- (unchanged) field choice in receipt/route.ts for the clinic-side
-- render — confirmed against real data that created_by resolves to the
-- actual treating/dispensing doctor, not a different staff member, so
-- this is not a field-choice bug, purely the RLS-invisibility one
-- described above.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_patient_receipt_extras_for_my_payment(p_payment_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'doctor_name', doc.full_name,
    'line_items', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'description', li.description,
            'quantity',    li.quantity,
            'unit_price',  li.unit_price,
            'total_price', li.total_price,
            'sort_order',  li.sort_order
          )
          ORDER BY li.sort_order
        )
        FROM public.payment_line_items li
        WHERE li.payment_id = pay.id
      ),
      '[]'::jsonb
    )
  )
  FROM public.payments  pay
  JOIN public.patients  p   ON p.id = pay.patient_id
  LEFT JOIN public.profiles doc ON doc.id = pay.created_by
  WHERE pay.id = p_payment_id
    AND p.deleted_at IS NULL
    AND p.family_account_id IS NOT NULL
    AND p.family_account_id = public.get_my_family_account_id()
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_patient_receipt_extras_for_my_payment(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_patient_receipt_extras_for_my_payment(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_patient_receipt_extras_for_my_payment(uuid) IS
  'Returns the treating doctor''s name and the full itemised line-items array for a payment belonging to the calling patient''s own family account. Exists because both profiles and payment_line_items RLS are clinic_id-scoped and a portal profile has clinic_id = NULL, making the doctor-name join and the line-items query both silently return nothing for a patient. Narrow SECURITY DEFINER, same entitlement predicate as get_clinic_header_for_my_payment, instead of loosening either table''s RLS.';

COMMIT;