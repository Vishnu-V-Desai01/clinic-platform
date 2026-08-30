-- ============================================================================
-- Pharmacy access scoping (Chat A, Step 2)
--
-- Two changes now that pharmacy_access exists (20260826100000):
--
-- 1. SPLIT catalogue-read from inventory-read. pharmacy_drugs (names/forms/
--    strengths only — no stock counts) stays visible to any doctor, since
--    Chat B's prescribing dropdown needs it. pharmacy_inventory, stock
--    adjustments, and dispensations become visible ONLY to pharmacy_access
--    users (am_i_pharmacy_user() — includes is_clinic_admin per Step 1).
--    A doctor with no granted pharmacy access can now see WHAT exists but
--    not HOW MUCH is in stock.
--
-- 2. NARROW dispensing itself. The original pharmacy_dispense() RPC let any
--    doctor dispense (role = 'doctor' was an explicit OR branch, independent
--    of am_i_pharmacist()). That contradicts "not all doctors should be
--    allowed to manage the inventory" — dispensing decrements stock, which
--    is inventory management. The doctor-role exception is removed; only
--    am_i_pharmacy_user() may dispense now. A doctor who has been granted
--    pharmacy_access (or is admin) can still dispense — this only removes
--    the blanket, ungated doctor exception.
--
-- pharmacy_cancel_dispensation() already required pharmacist/admin, not
-- doctor — unaffected by this migration.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1a. pharmacy_drugs_select — catalogue stays doctor-visible (needed to
--     prescribe), but "doctor" now also naturally includes any doctor who
--     separately has pharmacy_access, via the OR.
-- ---------------------------------------------------------------------------

drop policy if exists pharmacy_drugs_select on public.pharmacy_drugs;
create policy pharmacy_drugs_select
  on public.pharmacy_drugs for select
  using (
    clinic_id = public.get_my_clinic_id()
    and public.pharmacy_enabled_for_my_clinic()
    and (
      public.get_my_role() = 'doctor'
      or public.am_i_pharmacy_user()
    )
  );

-- ---------------------------------------------------------------------------
-- 1b. pharmacy_inventory_select — narrowed. Stock levels are no longer
--     visible to every doctor, only to pharmacy_access users.
-- ---------------------------------------------------------------------------

drop policy if exists pharmacy_inventory_select on public.pharmacy_inventory;
create policy pharmacy_inventory_select
  on public.pharmacy_inventory for select
  using (
    clinic_id = public.get_my_clinic_id()
    and public.pharmacy_enabled_for_my_clinic()
    and public.am_i_pharmacy_user()
  );

-- ---------------------------------------------------------------------------
-- 1c. pharmacy_stock_adjustments — select AND insert narrowed to pharmacy
--     users. Insert previously allowed 'doctor' as a bare role check
--     (matching the old blanket-dispense behaviour) — removed for the same
--     reason as the RPC change below.
-- ---------------------------------------------------------------------------

drop policy if exists pharmacy_stock_adjustments_select on public.pharmacy_stock_adjustments;
create policy pharmacy_stock_adjustments_select
  on public.pharmacy_stock_adjustments for select
  using (
    clinic_id = public.get_my_clinic_id()
    and public.pharmacy_enabled_for_my_clinic()
    and public.am_i_pharmacy_user()
  );

drop policy if exists pharmacy_stock_adjustments_insert on public.pharmacy_stock_adjustments;
create policy pharmacy_stock_adjustments_insert
  on public.pharmacy_stock_adjustments for insert
  with check (
    clinic_id = public.get_my_clinic_id()
    and public.pharmacy_enabled_for_my_clinic()
    and public.am_i_pharmacy_user()
  );

-- ---------------------------------------------------------------------------
-- 1d. pharmacy_dispensations_select — narrowed to pharmacy users.
-- ---------------------------------------------------------------------------

drop policy if exists pharmacy_dispensations_select on public.pharmacy_dispensations;
create policy pharmacy_dispensations_select
  on public.pharmacy_dispensations for select
  using (
    clinic_id = public.get_my_clinic_id()
    and public.pharmacy_enabled_for_my_clinic()
    and public.am_i_pharmacy_user()
  );

-- ---------------------------------------------------------------------------
-- 2. pharmacy_dispense() — remove the blanket doctor exception. Only
--    am_i_pharmacy_user() may dispense. CREATE OR REPLACE keeps the same
--    signature and grants; only the guard clause and error message change.
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
  v_can_dispense    boolean := public.am_i_pharmacy_user();
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

  -- Only a user with granted pharmacy access (or admin, via
  -- am_i_pharmacy_user()) may dispense. A doctor with no granted access can
  -- no longer dispense purely by virtue of being a doctor.
  if not v_can_dispense then
    raise exception 'PHARMACY_FORBIDDEN: you do not have pharmacy access.';
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

-- pharmacy_cancel_dispensation() already required (am_i_pharmacist() or
-- am_i_clinic_admin()) — under the Step 1 shim, am_i_pharmacist() now IS
-- am_i_pharmacy_user(), and am_i_pharmacy_user() already ORs in
-- is_clinic_admin. So "v_is_pharmacist or v_is_admin" is now a harmless
-- redundant OR, not a bug — left unchanged, no CREATE OR REPLACE needed here.