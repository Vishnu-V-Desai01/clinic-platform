BEGIN;

CREATE OR REPLACE FUNCTION public.get_admin_dashboard_kpis()
RETURNS TABLE (
  total_revenue_paise bigint,
  total_patients bigint,
  appointments_today bigint,
  active_staff bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  my_clinic_id uuid := get_my_clinic_id();
  clinic_tz text;
BEGIN
  IF NOT get_my_is_admin() THEN
    RAISE EXCEPTION 'Only clinic admins can view dashboard KPIs';
  END IF;

  SELECT timezone INTO clinic_tz FROM clinics WHERE id = my_clinic_id;
  clinic_tz := COALESCE(clinic_tz, 'Asia/Kolkata');

  RETURN QUERY
  SELECT
    -- amount_paid stores rupees; multiply by 100 to return paise
    -- so formatINR() in the UI divides back correctly
    COALESCE((
      SELECT (SUM(amount_paid) * 100)::bigint FROM payments
      WHERE clinic_id = my_clinic_id
        AND approval_status = 'approved'
        AND created_at >= (date_trunc('month', now() AT TIME ZONE clinic_tz) AT TIME ZONE clinic_tz)
    ), 0),
    COALESCE((
      SELECT COUNT(*) FROM patients
      WHERE clinic_id = my_clinic_id AND deleted_at IS NULL
    ), 0),
    COALESCE((
      SELECT COUNT(*) FROM appointments
      WHERE clinic_id = my_clinic_id
        AND deleted_at IS NULL
        AND (appointment_date AT TIME ZONE clinic_tz)::date = (now() AT TIME ZONE clinic_tz)::date
    ), 0),
    COALESCE((
      SELECT COUNT(*) FROM profiles
      WHERE clinic_id = my_clinic_id AND role = 'staff' AND status = 'active'
    ), 0);
END;
$function$;

COMMIT;