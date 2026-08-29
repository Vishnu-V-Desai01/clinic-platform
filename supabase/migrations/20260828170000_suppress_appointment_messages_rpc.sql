CREATE OR REPLACE FUNCTION public.suppress_appointment_messages(
  p_appointment_id uuid,
  p_actor_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_clinic_id uuid;
  v_ids uuid[];
BEGIN
  SELECT clinic_id INTO v_clinic_id
  FROM appointments
  WHERE id = p_appointment_id;

  IF v_clinic_id IS NULL OR v_clinic_id <> get_my_clinic_id() THEN
    RETURN 0;
  END IF;

  WITH updated AS (
    UPDATE message_queue
    SET status = 'cancelled',
        cancelled_at = now(),
        cancelled_by = p_actor_id
    WHERE appointment_id = p_appointment_id
      AND type = 'appointment'
      AND status = 'pending'
    RETURNING id
  )
  SELECT array_agg(id) INTO v_ids FROM updated;

  IF v_ids IS NOT NULL THEN
    INSERT INTO message_delivery_logs (clinic_id, message_queue_id, action, performed_by)
    SELECT v_clinic_id, unnest(v_ids), 'cancelled', p_actor_id;
  END IF;

  RETURN COALESCE(array_length(v_ids, 1), 0);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.suppress_appointment_messages(uuid, uuid) TO authenticated;