-- CURAKIN Pharmacy Tier-1: dispensation ledger.
-- Additive only. Depends on 20260822090100_pharmacy_core_tables.sql.
--
-- prescription_id is a plain uuid with NO foreign key in this migration,
-- because the source prescription table has not yet been confirmed against the
-- live schema. Migration 20260822090400 will add the FK once confirmed.
-- Everything else - clinic scoping, the double-dispense guard, RLS - works
-- correctly without that FK.

create table if not exists public.pharmacy_dispensations (
  id                 uuid primary key default gen_random_uuid(),
  clinic_id          uuid not null references public.clinics(id) on delete cascade,
  prescription_id    uuid,
  patient_id         uuid not null references public.patients(id) on delete restrict,
  drug_id            uuid not null references public.pharmacy_drugs(id) on delete restrict,
  quantity_dispensed integer not null,
  status             text not null default 'dispensed',
  dispensed_by       uuid references public.profiles(id),
  dispensed_at       timestamptz not null default now(),
  cancelled_by       uuid references public.profiles(id),
  cancelled_at       timestamptz,
  notes              text,
  created_at         timestamptz not null default now(),
  constraint pharmacy_dispensations_qty_positive
    check (quantity_dispensed > 0),
  constraint pharmacy_dispensations_status_allowed
    check (status in ('pending','dispensed','cancelled')),
  constraint pharmacy_dispensations_cancel_fields_consistent
    check (
      (status = 'cancelled' and cancelled_at is not null)
      or (status <> 'cancelled' and cancelled_at is null)
    )
);

comment on table public.pharmacy_dispensations is
  'CURAKIN: every dispensing event. Rows are written by pharmacy_dispense() only.';
comment on column public.pharmacy_dispensations.prescription_id is
  'Source prescription line. FK added in a later migration once the table is confirmed.';
comment on column public.pharmacy_dispensations.status is
  'v1 writes ''dispensed'' or ''cancelled''. ''pending'' is reserved and currently unused - the queue is derived from prescriptions lacking a dispensation, not from pending rows.';

-- THE double-dispense guard. A given prescription line can have at most one
-- live dispensation per drug. Cancelled rows are excluded, so a cancelled
-- dispensation frees the line to be dispensed again.
-- Partial WHERE clause -> .upsert() cannot express this. Find-then-write only.
create unique index if not exists pharmacy_dispensations_live_line_uidx
  on public.pharmacy_dispensations (clinic_id, prescription_id, drug_id)
  where status = 'dispensed' and prescription_id is not null;

create index if not exists pharmacy_dispensations_clinic_dispensed_at_idx
  on public.pharmacy_dispensations (clinic_id, dispensed_at desc);

create index if not exists pharmacy_dispensations_clinic_patient_idx
  on public.pharmacy_dispensations (clinic_id, patient_id, dispensed_at desc);

create index if not exists pharmacy_dispensations_clinic_drug_idx
  on public.pharmacy_dispensations (clinic_id, drug_id, dispensed_at desc);

-- Used by the queue query to test "does this prescription line already have a
-- live dispensation?" without a sequential scan.
create index if not exists pharmacy_dispensations_prescription_idx
  on public.pharmacy_dispensations (prescription_id)
  where prescription_id is not null;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.pharmacy_dispensations enable row level security;

drop policy if exists pharmacy_dispensations_select on public.pharmacy_dispensations;
create policy pharmacy_dispensations_select
  on public.pharmacy_dispensations for select
  using (
    clinic_id = public.get_my_clinic_id()
    and public.pharmacy_enabled_for_my_clinic()
    and public.get_my_role() in ('pharmacist','admin','doctor')
  );

-- No INSERT / UPDATE / DELETE policies by design.
-- All writes go through the SECURITY DEFINER functions in the next migration,
-- which is what makes the stock decrement atomic and unbypassable.

grant select on public.pharmacy_dispensations to authenticated;