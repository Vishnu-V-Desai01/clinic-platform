-- CURAKIN Pharmacy Tier-1: atomic dispense + cancel RPCs.
-- SECURITY DEFINER, so these bypass RLS and MUST re-check clinic, feature
-- flag, and role internally. They are the only writers to
-- pharmacy_dispensations and the only path that moves stock on a dispense.

-- ---------------------------------------------------------------------------
-- pharmacy_dispense
--
-- Atomicity: the inventory row is locked FOR UPDATE before anything is read or
-- written, so two pharmacists hitting the same drug serialise - the second
-- waits, then re-reads the decremented quantity. Combined with the
-- quantity_on_hand >= 0 CHECK constraint and the partial unique index on live
-- dispensations, negative stock and double-dispense are impossible at the
-- database layer, not merely discouraged in application code.
--
-- p_dispensed_by is passed in rather than derived, because profile resolution
-- lives in the app (getOrCreateProfile / requireRole). It is validated against
-- the caller's clinic below. Safe because all DB access is server-side only.
-- ---------------------------------------------------------------------------

drop function if exists public.pharmacy_dispense(uuid, uuid, uuid, integer, uuid, text, boolean);

create function public.pharmacy_dispense(
  p_prescription_id uuid,
  p_patient_id      uuid,
  p_drug_id         uuid,
  p_quantity        integer,
  p_dispensed_by    uuid,
  p_notes           text    default null,
  p_confirm_expired boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic_id       uuid    := public.get_my_clinic_id();
  v_role            text    := public.get_my_role();
  v_today_ist       date    := (now() at time zone 'Asia/Kolkata')::date;
  v_qty_on_hand     integer;
  v_expiry          date;
  v_drug_active     boolean;
  v_new_qty         integer;
  v_dispensation_id uuid;
begin
  -- ---- guards -------------------------------------------------------------

  if v_clinic_id is null then
    raise exception 'PHARMACY_NO_CLINIC: no clinic context for the current user.';
  end if;

  if not public.pharmacy_enabled_for_my_clinic() then
    raise exception 'PHARMACY_DISABLED: the pharmacy module is not enabled for this clinic.';
  end if;

  if v_role not in ('pharmacist', 'doctor') then
    raise exception 'PHARMACY_FORBIDDEN: role % is not permitted to dispense.', coalesce(v_role, 'unknown');
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'PHARMACY_BAD_QUANTITY: quantity to dispense must be a positive integer.';
  end if;

  if not exists (
    select 1 from public.profiles pr
     where pr.id = p_dispensed_by
       and pr.clinic_id = v_clinic_id
  ) then
    raise exception 'PHARMACY_BAD_ACTOR: dispensing profile does not belong to this clinic.';
  end if;

  if not exists (
    select 1 from public.patients pt
     where pt.id = p_patient_id
       and pt.clinic_id = v_clinic_id
  ) then
    raise exception 'PHARMACY_BAD_PATIENT: patient does not belong to this clinic.';
  end if;

  select d.is_active
    into v_drug_active
  from public.pharmacy_drugs d
  where d.id = p_drug_id
    and d.clinic_id = v_clinic_id;

  if v_drug_active is null then
    raise exception 'PHARMACY_UNKNOWN_DRUG: drug not found in this clinic''s catalogue.';
  end if;

  if not v_drug_active then
    raise exception 'PHARMACY_INACTIVE_DRUG: this drug has been removed from the catalogue.';
  end if;

  -- ---- lock the inventory row --------------------------------------------

  select i.quantity_on_hand, i.expiry_date
    into v_qty_on_hand, v_expiry
  from public.pharmacy_inventory i
  where i.clinic_id = v_clinic_id
    and i.drug_id   = p_drug_id
  for update;

  if not found then
    raise exception 'PHARMACY_NO_INVENTORY: no stock record exists for this drug. Add it to inventory first.';
  end if;

  if v_qty_on_hand < p_quantity then
    raise exception 'PHARMACY_INSUFFICIENT_STOCK: % on hand, % requested.', v_qty_on_hand, p_quantity;
  end if;

  -- Operational rule, not a clinical check: an expiry date typed by hand can
  -- drift, so this warns and demands explicit confirmation rather than
  -- blocking a pharmacist who is physically holding in-date stock.
  if v_expiry is not null and v_expiry < v_today_ist and not p_confirm_expired then
    raise exception 'PHARMACY_EXPIRED_STOCK: recorded expiry % has passed. Confirm to override.', to_char(v_expiry, 'DD Mon YYYY');
  end if;

  -- ---- write the dispensation first --------------------------------------
  -- Insert before the stock update so the unique index rejects a concurrent
  -- duplicate before any quantity moves.

  begin
    insert into public.pharmacy_dispensations (
      clinic_id, prescription_id, patient_id, drug_id,
      quantity_dispensed, status, dispensed_by, notes
    )
    values (
      v_clinic_id, p_prescription_id, p_patient_id, p_drug_id,
      p_quantity, 'dispensed', p_dispensed_by,
      case
        when v_expiry is not null and v_expiry < v_today_ist
          then trim(both from coalesce(p_notes || ' | ', '') ||
               'Expired stock dispensed with explicit confirmation (expiry ' ||
               to_char(v_expiry, 'DD Mon YYYY') || ').')
        else p_notes
      end
    )
    returning id into v_dispensation_id;
  exception
    when unique_violation then
      raise exception 'PHARMACY_ALREADY_DISPENSED: this prescription line has already been dispensed.';
  end;

  -- ---- move the stock -----------------------------------------------------

  update public.pharmacy_inventory
     set quantity_on_hand = quantity_on_hand - p_quantity
   where clinic_id = v_clinic_id
     and drug_id   = p_drug_id
  returning quantity_on_hand into v_new_qty;

  insert into public.pharmacy_stock_adjustments (
    clinic_id, drug_id, delta, quantity_after, reason, notes, adjusted_by
  )
  values (
    v_clinic_id, p_drug_id, -p_quantity, v_new_qty, 'dispensed',
    'Dispensation ' || v_dispensation_id::text, p_dispensed_by
  );

  return v_dispensation_id;
end;
$$;

comment on function public.pharmacy_dispense(uuid, uuid, uuid, integer, uuid, text, boolean) is
  'CURAKIN: atomically records a dispensation and decrements stock. Raises PHARMACY_* errors the server action maps to user-facing messages.';

-- ---------------------------------------------------------------------------
-- pharmacy_cancel_dispensation
--
-- Reverses a mis-dispense: restores stock, marks the row cancelled, and frees
-- the prescription line to be dispensed again (the unique index only covers
-- status = 'dispensed'). The original row is never deleted.
-- ---------------------------------------------------------------------------

drop function if exists public.pharmacy_cancel_dispensation(uuid, uuid, text);

create function public.pharmacy_cancel_dispensation(
  p_dispensation_id uuid,
  p_cancelled_by    uuid,
  p_reason          text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic_id uuid    := public.get_my_clinic_id();
  v_role      text    := public.get_my_role();
  v_drug_id   uuid;
  v_quantity  integer;
  v_status    text;
  v_new_qty   integer;
begin
  if v_clinic_id is null then
    raise exception 'PHARMACY_NO_CLINIC: no clinic context for the current user.';
  end if;

  if not public.pharmacy_enabled_for_my_clinic() then
    raise exception 'PHARMACY_DISABLED: the pharmacy module is not enabled for this clinic.';
  end if;

  if v_role not in ('pharmacist', 'admin') then
    raise exception 'PHARMACY_FORBIDDEN: role % is not permitted to cancel a dispensation.', coalesce(v_role, 'unknown');
  end if;

  if not exists (
    select 1 from public.profiles pr
     where pr.id = p_cancelled_by
       and pr.clinic_id = v_clinic_id
  ) then
    raise exception 'PHARMACY_BAD_ACTOR: cancelling profile does not belong to this clinic.';
  end if;

  select d.drug_id, d.quantity_dispensed, d.status
    into v_drug_id, v_quantity, v_status
  from public.pharmacy_dispensations d
  where d.id = p_dispensation_id
    and d.clinic_id = v_clinic_id
  for update;

  if not found then
    raise exception 'PHARMACY_UNKNOWN_DISPENSATION: dispensation not found in this clinic.';
  end if;

  -- Idempotent: cancelling an already-cancelled row is a no-op, not an error,
  -- so a double-clicked button cannot restore stock twice.
  if v_status = 'cancelled' then
    return p_dispensation_id;
  end if;

  perform 1
  from public.pharmacy_inventory i
  where i.clinic_id = v_clinic_id
    and i.drug_id   = v_drug_id
  for update;

  update public.pharmacy_dispensations
     set status       = 'cancelled',
         cancelled_by = p_cancelled_by,
         cancelled_at = now(),
         notes        = trim(both from coalesce(notes || ' | ', '') ||
                        'Cancelled: ' || coalesce(nullif(trim(p_reason), ''), 'no reason given'))
   where id = p_dispensation_id;

  update public.pharmacy_inventory
     set quantity_on_hand = quantity_on_hand + v_quantity
   where clinic_id = v_clinic_id
     and drug_id   = v_drug_id
  returning quantity_on_hand into v_new_qty;

  if v_new_qty is not null then
    insert into public.pharmacy_stock_adjustments (
      clinic_id, drug_id, delta, quantity_after, reason, notes, adjusted_by
    )
    values (
      v_clinic_id, v_drug_id, v_quantity, v_new_qty, 'manual_correction',
      'Reversal of dispensation ' || p_dispensation_id::text, p_cancelled_by
    );
  end if;

  return p_dispensation_id;
end;
$$;

comment on function public.pharmacy_cancel_dispensation(uuid, uuid, text) is
  'CURAKIN: reverses a dispensation, restores stock, frees the prescription line. Idempotent.';

-- ---------------------------------------------------------------------------
-- Grants: SECURITY DEFINER functions must not be executable by anon.
-- ---------------------------------------------------------------------------

revoke all on function public.pharmacy_dispense(uuid, uuid, uuid, integer, uuid, text, boolean) from public;
revoke all on function public.pharmacy_cancel_dispensation(uuid, uuid, text) from public;

grant execute on function public.pharmacy_dispense(uuid, uuid, uuid, integer, uuid, text, boolean) to authenticated;
grant execute on function public.pharmacy_cancel_dispensation(uuid, uuid, text) to authenticated;