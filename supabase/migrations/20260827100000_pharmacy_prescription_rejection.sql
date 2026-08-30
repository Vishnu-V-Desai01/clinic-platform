-- ============================================================================
-- Pharmacy rejection of a prescription line (insufficient stock, etc.)
--
-- prescriptions_update RLS (20260618000000_medical_records_feature.sql)
-- requires get_my_role() = 'doctor' — a staff-role pharmacist, even with
-- pharmacy_access granted, cannot update this table directly. Mirrors the
-- exact reason pharmacy_dispense() exists as a SECURITY DEFINER RPC rather
-- than a direct table write.
--
-- Deliberately NOT reusing prescriptions.status ('active'|'stopped'|
-- 'completed') for this — that field is the doctor's clinical view of the
-- prescription. Repurposing 'stopped' would make "doctor stopped this
-- medication" and "pharmacy couldn't dispense it" indistinguishable. Three
-- new nullable columns track rejection independently; the pharmacy queue
-- excludes rejected rows via the same anti-join pattern already used for
-- dispensed rows, not by mutating status.
-- ============================================================================

ALTER TABLE public.prescriptions
  ADD COLUMN IF NOT EXISTS pharmacy_rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS pharmacy_rejected_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pharmacy_rejection_reason text;

COMMENT ON COLUMN public.prescriptions.pharmacy_rejected_at IS
  'Set when a pharmacy user declines to dispense this line (e.g. insufficient stock). NULL means not rejected. Independent of status — a doctor-stopped prescription and a pharmacy-rejected one are different concepts.';

CREATE INDEX IF NOT EXISTS idx_prescriptions_pharmacy_rejected
  ON public.prescriptions(clinic_id, pharmacy_rejected_at)
  WHERE pharmacy_rejected_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.pharmacy_reject_prescription(
  p_prescription_id uuid,
  p_rejected_by     uuid,
  p_reason          text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id    uuid    := public.get_my_clinic_id();
  v_can_reject   boolean := public.am_i_pharmacy_user();
  v_already_disp boolean;
BEGIN
  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'PHARMACY_NO_CLINIC: no clinic context for the current user.';
  END IF;

  IF NOT public.pharmacy_enabled_for_my_clinic() THEN
    RAISE EXCEPTION 'PHARMACY_DISABLED: the pharmacy module is not enabled for this clinic.';
  END IF;

  IF NOT v_can_reject THEN
    RAISE EXCEPTION 'PHARMACY_FORBIDDEN: you do not have pharmacy access.';
  END IF;

  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'PHARMACY_BAD_REASON: a reason is required to reject a prescription.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles pr
     WHERE pr.id = p_rejected_by
       AND pr.clinic_id = v_clinic_id
  ) THEN
    RAISE EXCEPTION 'PHARMACY_BAD_ACTOR: rejecting profile does not belong to this clinic.';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.pharmacy_dispensations d
     WHERE d.prescription_id = p_prescription_id
       AND d.status = 'dispensed'
  ) INTO v_already_disp;

  IF v_already_disp THEN
    RAISE EXCEPTION 'PHARMACY_ALREADY_DISPENSED: this prescription line has already been dispensed.';
  END IF;

  UPDATE public.prescriptions
     SET pharmacy_rejected_at     = now(),
         pharmacy_rejected_by     = p_rejected_by,
         pharmacy_rejection_reason = btrim(p_reason)
   WHERE id = p_prescription_id
     AND clinic_id = v_clinic_id
     AND pharmacy_rejected_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PHARMACY_UNKNOWN_DRUG: prescription not found in this clinic, or already rejected.';
  END IF;

  RETURN p_prescription_id;
END;
$$;

REVOKE ALL ON FUNCTION public.pharmacy_reject_prescription(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pharmacy_reject_prescription(uuid, uuid, text) TO authenticated;