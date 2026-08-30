-- CURAKIN Pharmacy Tier-1: correct the role/admin model.
--
-- Confirmed live schema:
--   profiles.role IN ('doctor','staff','patient')   -- no 'pharmacist', no 'admin'
--   profiles.staff_type IN ('receptionist','nurse','assistant','pharmacist') NULLable
--   profiles.is_clinic_admin boolean                -- admin is a FLAG, not a role
--
-- Every policy and RPC written in migrations 20260822180000-180300 checked
-- role = 'pharmacist' or role = 'admin', neither of which can ever occur.
-- Those checks were dead: not insecure, but permission-less. This migration
-- replaces them with the correct model:
--   "is pharmacist" = role = 'staff' AND staff_type = 'pharmacist'
--   "is admin"      = is_clinic_admin = true (independent of role)
--
-- Also adds the now-confirmed FK: pharmacy_dispensations.prescription_id ->
-- prescriptions.id.

-- ---------------------------------------------------------------------------
-- 1. Helpers, matching the exact resolution shape of get_my_role() /
--    get_my_clinic_id() (clerk_user_id = auth.jwt()->>'sub', SECURITY DEFINER,
--    STABLE, search_path pinned) so RLS evaluates them identically.
-- ---------------------------------------------------------------------------

create or replace function public.am_i_pharmacist()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles
     where clerk_user_id = (auth.jwt()->>'sub')
       and role = 'staff'
       and staff_type = 'pharmacist'
  )
$$;

comment on function public.am_i_pharmacist() is
  'CURAKIN: true if the calling user is a staff profile with staff_type = pharmacist.';

create or replace function public.am_i_clinic_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select is_clinic_admin from profiles where clerk_user_id = (auth.jwt()->>'sub')),
    false
  )
$$;

comment on function public.am_i_clinic_admin() is
  'CURAKIN: true if the calling user''s profile has is_clinic_admin = true. Independent of role.';

revoke all on function public.am_i_pharmacist()     from public;
revoke all on function public.am_i_clinic_admin()   from public;
grant execute on function public.am_i_pharmacist()   to authenticated;
grant execute on function public.am_i_clinic_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. pharmacy_drugs - replace all three policies
-- ---------------------------------------------------------------------------

drop policy if exists pharmacy_drugs_select on public.pharmacy_drugs;
create policy pharmacy_drugs_select
  on public.pharmacy_drugs for select
  using (
    clinic_id = public.get_my_clinic_id()
    and public.pharmacy_enabled_for_my_clinic()
    and (
      public.get_my_role() = 'doctor'
      or public.am_i_pharmacist()
      or public.am_i_clinic_admin()
    )
  );

drop policy if exists pharmacy_drugs_insert on public.pharmacy_drugs;
create policy pharmacy_drugs_insert
  on public.pharmacy_drugs for insert
  with check (
    clinic_id = public.get_my_clinic_id()
    and public.pharmacy_enabled_for_my_clinic()
    and (public.am_i_pharmacist() or public.am_i_clinic_admin())
  );

drop policy if exists pharmacy_drugs_update on public.pharmacy_drugs;
create policy pharmacy_drugs_update
  on public.pharmacy_drugs for update
  using (
    clinic_id = public.get_my_clinic_id()
    and public.pharmacy_enabled_for_my_clinic()
    and (public.am_i_pharmacist() or public.am_i_clinic_admin())
  )
  with check (
    clinic_id = public.get_my_clinic_id()
    and (public.am_i_pharmacist() or public.am_i_clinic_admin())
  );

-- ---------------------------------------------------------------------------
-- 3. pharmacy_inventory - replace all three policies
--    UPDATE narrowed to pharmacist/admin only (doctor writes go through the
--    SECURITY DEFINER dispense RPC, which bypasses RLS - no table grant needed)
-- ---------------------------------------------------------------------------

drop policy if exists pharmacy_inventory_select on public.pharmacy_inventory;
create policy pharmacy_inventory_select
  on public.pharmacy_inventory for select
  using (
    clinic_id = public.get_my_clinic_id()
    and public.pharmacy_enabled_for_my_clinic()
    and (
      public.get_my_role() = 'doctor'
      or public.am_i_pharmacist()
      or public.am_i_clinic_admin()
    )
  );

drop policy if exists pharmacy_inventory_insert on public.pharmacy_inventory;
create policy pharmacy_inventory_insert
  on public.pharmacy_inventory for insert
  with check (
    clinic_id = public.get_my_clinic_id()
    and public.pharmacy_enabled_for_my_clinic()
    and (public.am_i_pharmacist() or public.am_i_clinic_admin())
  );

drop policy if exists pharmacy_inventory_update on public.pharmacy_inventory;
create policy pharmacy_inventory_update
  on public.pharmacy_inventory for update
  using (
    clinic_id = public.get_my_clinic_id()
    and public.pharmacy_enabled_for_my_clinic()
    and (public.am_i_pharmacist() or public.am_i_clinic_admin())
  )
  with check (
    clinic_id = public.get_my_clinic_id()
    and (public.am_i_pharmacist() or public.am_i_clinic_admin())
  );

-- ---------------------------------------------------------------------------
-- 4. pharmacy_stock_adjustments - replace both policies
-- ---------------------------------------------------------------------------

drop policy if exists pharmacy_stock_adjustments_select on public.pharmacy_stock_adjustments;
create policy pharmacy_stock_adjustments_select
  on public.pharmacy_stock_adjustments for select
  using (
    clinic_id = public.get_my_clinic_id()
    and public.pharmacy_enabled_for_my_clinic()
    and (
      public.get_my_role() = 'doctor'
      or public.am_i_pharmacist()
      or public.am_i_clinic_admin()
    )
  );

drop policy if exists pharmacy_stock_adjustments_insert on public.pharmacy_stock_adjustments;
create policy pharmacy_stock_adjustments_insert
  on public.pharmacy_stock_adjustments for insert
  with check (
    clinic_id = public.get_my_clinic_id()
    and public.pharmacy_enabled_for_my_clinic()
    and (
      public.get_my_role() = 'doctor'
      or public.am_i_pharmacist()
      or public.am_i_clinic_admin()
    )
  );

-- ---------------------------------------------------------------------------
-- 5. pharmacy_dispensations - replace the select policy
-- ---------------------------------------------------------------------------

drop policy if exists pharmacy_dispensations_select on public.pharmacy_dispensations;
create policy pharmacy_dispensations_select
  on public.pharmacy_dispensations for select
  using (
    clinic_id = public.get_my_clinic_id()
    and public.pharmacy_enabled_for_my_clinic()
    and (
      public.get_my_role() = 'doctor'
      or public.am_i_pharmacist()
      or public.am_i_clinic_admin()
    )
  );

-- ---------------------------------------------------------------------------
-- 6. Add the now-confirmed FK: prescription_id -> prescriptions.id
--    Nullable retained (a walk-in dispensation with no linked prescription is
--    plausible for a Tier-1 module), but any non-null value must now resolve.
-- ---------------------------------------------------------------------------

alter table public.pharmacy_dispensations
  add constraint pharmacy_dispensations_prescription_id_fkey
  foreign key (prescription_id) references public.prescriptions(id) on delete restrict;

comment on column public.pharmacy_dispensations.prescription_id is
  'Source prescription line (prescriptions.id). Nullable for walk-in dispensations with no prescription on file.';

-- ---------------------------------------------------------------------------
-- 7. Fix the role guards inside the RPCs
--    CREATE OR REPLACE keeps the existing signature (and therefore existing
--    grants) intact - only the body changes.
-- ---------------------------------------------------------------------------

create or replace function public.pharmacy_dispense(
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
  v_is_pharmacist   boolean := public.am_i_pharmacist();
  v_today_ist       date    := (now() at time zone 'Asia/Kolkata')::date;
  v_qty_on_hand     integer;
  v_expiry          date;
  v_drug_active     boolean;
  v_new_qty         integer;
  v_dispensation_id uuid;
begin
  if v_clinic_id is null then
    raise exception 'PHARMACY_NO_CLINIC: no clinic context for the current user.';
  end if;

  if not public.pharmacy_enabled_for_my_clinic() then
    raise exception 'PHARMACY_DISABLED: the pharmacy module is not enabled for this clinic.';
  end if;

  -- Only a pharmacist (staff, staff_type = pharmacist) or a doctor may dispense.
  if not (v_is_pharmacist or v_role = 'doctor') then
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

  if v_expiry is not null and v_expiry < v_today_ist and not p_confirm_expired then
    raise exception 'PHARMACY_EXPIRED_STOCK: recorded expiry % has passed. Confirm to override.', to_char(v_expiry, 'DD Mon YYYY');
  end if;

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

create or replace function public.pharmacy_cancel_dispensation(
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
  v_is_pharmacist boolean := public.am_i_pharmacist();
  v_is_admin      boolean := public.am_i_clinic_admin();
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

  -- Cancelling reverses a stock movement, so it is deliberately narrower than
  -- dispensing: pharmacist or admin only, not doctor.
  if not (v_is_pharmacist or v_is_admin) then
    raise exception 'PHARMACY_FORBIDDEN: only a pharmacist or clinic admin may cancel a dispensation.';
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