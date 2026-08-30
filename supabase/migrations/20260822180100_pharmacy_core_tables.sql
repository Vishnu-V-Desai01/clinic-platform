-- CURAKIN Pharmacy Tier-1: feature flag, drug catalogue, inventory, stock audit.
-- Additive only. No existing column, table, or policy is modified.
-- Dispensations are created in a later migration (needs the prescription table).

-- ---------------------------------------------------------------------------
-- 1. Per-clinic feature flag (the Rs 4,000/yr add-on gate)
-- ---------------------------------------------------------------------------

alter table public.clinics
  add column if not exists pharmacy_enabled boolean not null default false;

comment on column public.clinics.pharmacy_enabled is
  'CURAKIN: gates the entire pharmacy module for this clinic. Default false.';

-- ---------------------------------------------------------------------------
-- 2. Helper: is the pharmacy module switched on for the caller''s clinic?
--    SECURITY DEFINER so RLS policies can read clinics without recursion.
-- ---------------------------------------------------------------------------

drop function if exists public.pharmacy_enabled_for_my_clinic();

create function public.pharmacy_enabled_for_my_clinic()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select c.pharmacy_enabled
       from public.clinics c
      where c.id = public.get_my_clinic_id()),
    false
  );
$$;

comment on function public.pharmacy_enabled_for_my_clinic() is
  'CURAKIN: true when the calling user''s clinic has the pharmacy add-on enabled.';

-- ---------------------------------------------------------------------------
-- 3. Shared updated_at trigger for pharmacy tables
-- ---------------------------------------------------------------------------

drop function if exists public.pharmacy_touch_updated_at() cascade;

create function public.pharmacy_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. pharmacy_drugs - the clinic''s drug catalogue
-- ---------------------------------------------------------------------------

create table if not exists public.pharmacy_drugs (
  id           uuid primary key default gen_random_uuid(),
  clinic_id    uuid not null references public.clinics(id) on delete cascade,
  name         text not null,
  generic_name text,
  form         text not null,
  strength     text,
  unit         text,
  code         text,
  code_system  text,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint pharmacy_drugs_name_not_blank
    check (length(btrim(name)) > 0),
  constraint pharmacy_drugs_form_allowed
    check (form in ('tablet','capsule','syrup','suspension','injection',
                    'ointment','cream','drops','inhaler','sachet','other'))
);

comment on table public.pharmacy_drugs is
  'CURAKIN: per-clinic drug catalogue. Soft-delete via is_active; never hard-delete.';
comment on column public.pharmacy_drugs.code is
  'Optional future drug coding (e.g. SNOMED/ATC). Nullable, unused in v1.';

create index if not exists pharmacy_drugs_clinic_active_idx
  on public.pharmacy_drugs (clinic_id, is_active);

create index if not exists pharmacy_drugs_clinic_name_idx
  on public.pharmacy_drugs (clinic_id, lower(name));

-- Partial unique index: no duplicate ACTIVE drug with the same
-- name + strength + form inside one clinic. Inactive rows are exempt so a
-- soft-deleted drug can be re-added later.
-- NOTE: .upsert() cannot express this WHERE clause - use find-then-write.
create unique index if not exists pharmacy_drugs_clinic_identity_uidx
  on public.pharmacy_drugs (clinic_id, lower(btrim(name)), coalesce(lower(btrim(strength)), ''), form)
  where is_active;

drop trigger if exists pharmacy_drugs_touch on public.pharmacy_drugs;
create trigger pharmacy_drugs_touch
  before update on public.pharmacy_drugs
  for each row execute function public.pharmacy_touch_updated_at();

-- ---------------------------------------------------------------------------
-- 5. pharmacy_inventory - ONE ROW PER DRUG (v1 decision)
-- ---------------------------------------------------------------------------

create table if not exists public.pharmacy_inventory (
  id                uuid primary key default gen_random_uuid(),
  clinic_id         uuid not null references public.clinics(id) on delete cascade,
  drug_id           uuid not null references public.pharmacy_drugs(id) on delete restrict,
  quantity_on_hand  integer not null default 0,
  reorder_threshold integer,
  batch_number      text,
  expiry_date       date,
  unit_price_paise  integer,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint pharmacy_inventory_qty_non_negative
    check (quantity_on_hand >= 0),
  constraint pharmacy_inventory_threshold_non_negative
    check (reorder_threshold is null or reorder_threshold >= 0),
  constraint pharmacy_inventory_price_non_negative
    check (unit_price_paise is null or unit_price_paise >= 0)
);

comment on table public.pharmacy_inventory is
  'CURAKIN: one row per drug per clinic. expiry_date = earliest expiry currently on shelf.';
comment on column public.pharmacy_inventory.unit_price_paise is
  'Integer paise (Rs 1 = 100 paise). NOT the payments table convention.';

-- The real guarantee that stock can never go negative lives in the CHECK above.
-- Application logic is a second line of defence, not the first.

create unique index if not exists pharmacy_inventory_clinic_drug_uidx
  on public.pharmacy_inventory (clinic_id, drug_id);

create index if not exists pharmacy_inventory_clinic_expiry_idx
  on public.pharmacy_inventory (clinic_id, expiry_date)
  where expiry_date is not null;

drop trigger if exists pharmacy_inventory_touch on public.pharmacy_inventory;
create trigger pharmacy_inventory_touch
  before update on public.pharmacy_inventory
  for each row execute function public.pharmacy_touch_updated_at();

-- ---------------------------------------------------------------------------
-- 6. pharmacy_stock_adjustments - audit trail for manual stock corrections
-- ---------------------------------------------------------------------------

create table if not exists public.pharmacy_stock_adjustments (
  id              uuid primary key default gen_random_uuid(),
  clinic_id       uuid not null references public.clinics(id) on delete cascade,
  drug_id         uuid not null references public.pharmacy_drugs(id) on delete restrict,
  delta           integer not null,
  quantity_after  integer not null,
  reason          text not null default 'manual_correction',
  notes           text,
  adjusted_by     uuid references public.profiles(id),
  adjusted_at     timestamptz not null default now(),
  constraint pharmacy_stock_adjustments_qty_after_non_negative
    check (quantity_after >= 0),
  constraint pharmacy_stock_adjustments_reason_allowed
    check (reason in ('manual_correction','stock_received','damaged','expired_removed','dispensed','other'))
);

comment on table public.pharmacy_stock_adjustments is
  'CURAKIN: append-only audit of every stock change, including dispensations.';

create index if not exists pharmacy_stock_adjustments_clinic_drug_idx
  on public.pharmacy_stock_adjustments (clinic_id, drug_id, adjusted_at desc);

-- ---------------------------------------------------------------------------
-- 7. Row Level Security
--    Every policy is scoped to get_my_clinic_id() AND gated on the feature
--    flag, so pharmacy_enabled = false is enforced at the database layer, not
--    merely hidden in the UI.
-- ---------------------------------------------------------------------------

alter table public.pharmacy_drugs             enable row level security;
alter table public.pharmacy_inventory         enable row level security;
alter table public.pharmacy_stock_adjustments enable row level security;

-- --- pharmacy_drugs ---

drop policy if exists pharmacy_drugs_select on public.pharmacy_drugs;
create policy pharmacy_drugs_select
  on public.pharmacy_drugs for select
  using (
    clinic_id = public.get_my_clinic_id()
    and public.pharmacy_enabled_for_my_clinic()
    and public.get_my_role() in ('pharmacist','admin','doctor','staff')
  );

drop policy if exists pharmacy_drugs_insert on public.pharmacy_drugs;
create policy pharmacy_drugs_insert
  on public.pharmacy_drugs for insert
  with check (
    clinic_id = public.get_my_clinic_id()
    and public.pharmacy_enabled_for_my_clinic()
    and public.get_my_role() in ('pharmacist','admin')
  );

drop policy if exists pharmacy_drugs_update on public.pharmacy_drugs;
create policy pharmacy_drugs_update
  on public.pharmacy_drugs for update
  using (
    clinic_id = public.get_my_clinic_id()
    and public.pharmacy_enabled_for_my_clinic()
    and public.get_my_role() in ('pharmacist','admin')
  )
  with check (
    clinic_id = public.get_my_clinic_id()
    and public.get_my_role() in ('pharmacist','admin')
  );

-- Deliberately no DELETE policy: soft-delete only (is_active = false).

-- --- pharmacy_inventory ---

drop policy if exists pharmacy_inventory_select on public.pharmacy_inventory;
create policy pharmacy_inventory_select
  on public.pharmacy_inventory for select
  using (
    clinic_id = public.get_my_clinic_id()
    and public.pharmacy_enabled_for_my_clinic()
    and public.get_my_role() in ('pharmacist','admin','doctor','staff')
  );

drop policy if exists pharmacy_inventory_insert on public.pharmacy_inventory;
create policy pharmacy_inventory_insert
  on public.pharmacy_inventory for insert
  with check (
    clinic_id = public.get_my_clinic_id()
    and public.pharmacy_enabled_for_my_clinic()
    and public.get_my_role() in ('pharmacist','admin')
  );

drop policy if exists pharmacy_inventory_update on public.pharmacy_inventory;
create policy pharmacy_inventory_update
  on public.pharmacy_inventory for update
  using (
    clinic_id = public.get_my_clinic_id()
    and public.pharmacy_enabled_for_my_clinic()
    and public.get_my_role() in ('pharmacist','admin','doctor')
  )
  with check (
    clinic_id = public.get_my_clinic_id()
    and public.get_my_role() in ('pharmacist','admin','doctor')
  );

-- --- pharmacy_stock_adjustments (append-only) ---

drop policy if exists pharmacy_stock_adjustments_select on public.pharmacy_stock_adjustments;
create policy pharmacy_stock_adjustments_select
  on public.pharmacy_stock_adjustments for select
  using (
    clinic_id = public.get_my_clinic_id()
    and public.pharmacy_enabled_for_my_clinic()
    and public.get_my_role() in ('pharmacist','admin','doctor')
  );

drop policy if exists pharmacy_stock_adjustments_insert on public.pharmacy_stock_adjustments;
create policy pharmacy_stock_adjustments_insert
  on public.pharmacy_stock_adjustments for insert
  with check (
    clinic_id = public.get_my_clinic_id()
    and public.pharmacy_enabled_for_my_clinic()
    and public.get_my_role() in ('pharmacist','admin','doctor')
  );

-- No UPDATE or DELETE policy: the audit trail is immutable.

-- ---------------------------------------------------------------------------
-- 8. Grants (RLS still governs row visibility)
-- ---------------------------------------------------------------------------

grant select, insert, update on public.pharmacy_drugs             to authenticated;
grant select, insert, update on public.pharmacy_inventory         to authenticated;
grant select, insert         on public.pharmacy_stock_adjustments to authenticated;
grant execute on function public.pharmacy_enabled_for_my_clinic() to authenticated;