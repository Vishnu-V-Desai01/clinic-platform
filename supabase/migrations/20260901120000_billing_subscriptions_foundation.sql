-- ============================================================
-- Chat 25 — Billing & Subscriptions foundation
-- Additive only. No existing column, constraint, or policy is modified.
--
-- Adds:
--   1. clinics: subscription state columns (backfilled to 'active' for
--      existing rows so dev/demo clinics are not knocked into a trial)
--   2. subscriptions  — one row per purchased term
--   3. invoices       — immutable financial records, tax snapshotted
--   4. enterprise_leads — public contact form capture
--   5. Helper functions: invoice numbering, tier seat limits, doctor count
--   6. RLS: admin-only read; ALL writes are service-role only
-- ============================================================

-- ------------------------------------------------------------
-- 1. clinics — subscription state
-- ------------------------------------------------------------

alter table public.clinics
  add column if not exists subscription_tier    text,
  add column if not exists subscription_term    text,
  add column if not exists subscription_status  text,
  add column if not exists trial_ends_at        timestamptz,
  add column if not exists current_period_start timestamptz,
  add column if not exists current_period_end   timestamptz;

-- Backfill existing clinics as paid-and-active through 2027-12-31.
-- Rationale: existing rows are dev/demo/pilot clinics. Defaulting them to
-- 'trialing' would start a 14-day clock that could expire mid-demo.
update public.clinics
set subscription_tier    = coalesce(subscription_tier, 'clinic'),
    subscription_term    = coalesce(subscription_term, '1yr'),
    subscription_status  = coalesce(subscription_status, 'active'),
    current_period_start = coalesce(current_period_start, now()),
    current_period_end   = coalesce(current_period_end, '2027-12-31 23:59:59+05:30'::timestamptz)
where subscription_tier is null
   or subscription_term is null
   or subscription_status is null;

alter table public.clinics
  alter column subscription_tier   set default 'clinic',
  alter column subscription_term   set default '1yr',
  alter column subscription_status set default 'trialing';

alter table public.clinics
  alter column subscription_tier   set not null,
  alter column subscription_term   set not null,
  alter column subscription_status set not null;

alter table public.clinics
  drop constraint if exists clinics_subscription_tier_check;
alter table public.clinics
  add constraint clinics_subscription_tier_check
  check (subscription_tier = any (array['solo','clinic','group','enterprise']));

alter table public.clinics
  drop constraint if exists clinics_subscription_term_check;
alter table public.clinics
  add constraint clinics_subscription_term_check
  check (subscription_term = any (array['1yr','3yr','5yr']));

alter table public.clinics
  drop constraint if exists clinics_subscription_status_check;
alter table public.clinics
  add constraint clinics_subscription_status_check
  check (subscription_status = any (array['trialing','active','past_due','cancelled','expired']));

comment on column public.clinics.subscription_status is
  'Billing lifecycle. Distinct from clinics.status (active/suspended), which is operational.';

-- ------------------------------------------------------------
-- 2. subscriptions — one row per purchased term
-- ------------------------------------------------------------

create table if not exists public.subscriptions (
  id                       uuid primary key default gen_random_uuid(),
  clinic_id                uuid not null references public.clinics(id) on delete cascade,

  -- razorpay_order_id is the webhook idempotency key. UNIQUE is what makes
  -- a duplicate webhook delivery a no-op instead of a double subscription.
  razorpay_order_id        text unique,
  razorpay_payment_id      text unique,
  razorpay_subscription_id text,   -- reserved; unused in v1 (Orders, not Subscriptions)
  razorpay_customer_id     text,

  tier         text   not null,
  term         text   not null,
  status       text   not null default 'pending',
  amount_paise bigint not null check (amount_paise >= 0),

  starts_at  timestamptz,
  ends_at    timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.subscriptions
  drop constraint if exists subscriptions_tier_check;
alter table public.subscriptions
  add constraint subscriptions_tier_check
  check (tier = any (array['solo','clinic','group','enterprise']));

alter table public.subscriptions
  drop constraint if exists subscriptions_term_check;
alter table public.subscriptions
  add constraint subscriptions_term_check
  check (term = any (array['1yr','3yr','5yr']));

alter table public.subscriptions
  drop constraint if exists subscriptions_status_check;
alter table public.subscriptions
  add constraint subscriptions_status_check
  check (status = any (array['pending','active','expired','cancelled','failed']));

create index if not exists idx_subscriptions_clinic_id
  on public.subscriptions(clinic_id);
create index if not exists idx_subscriptions_status
  on public.subscriptions(status);

-- ------------------------------------------------------------
-- 3. invoices — immutable financial records
--    Tax treatment is SNAPSHOTTED, never recomputed. Changing the GST
--    config later must not retroactively alter issued invoices.
-- ------------------------------------------------------------

create table if not exists public.invoices (
  id              uuid primary key default gen_random_uuid(),

  -- RESTRICT, not CASCADE: deleting a clinic must never delete its
  -- financial history. Deletion is blocked until invoices are archived.
  clinic_id       uuid not null references public.clinics(id) on delete restrict,
  subscription_id uuid references public.subscriptions(id) on delete set null,

  invoice_number      text not null unique,
  razorpay_payment_id text unique,
  razorpay_invoice_id text,

  -- Money snapshot
  subtotal_paise   bigint  not null check (subtotal_paise >= 0),
  gst_mode         text    not null default 'none',   -- none | inclusive | exclusive
  gst_rate_bp      integer not null default 0,        -- basis points; 1800 = 18%
  gst_amount_paise bigint  not null default 0 check (gst_amount_paise >= 0),
  total_paise      bigint  not null check (total_paise >= 0),

  seller_gstin text,   -- CURAKIN's GSTIN as of issue; null while unregistered
  buyer_gstin  text,   -- snapshot of clinics.gst_number as of issue

  status    text not null default 'pending',
  issued_at timestamptz not null default now(),
  paid_at   timestamptz,
  pdf_url   text,

  created_at timestamptz not null default now()
);

alter table public.invoices
  drop constraint if exists invoices_status_check;
alter table public.invoices
  add constraint invoices_status_check
  check (status = any (array['paid','pending','failed']));

alter table public.invoices
  drop constraint if exists invoices_gst_mode_check;
alter table public.invoices
  add constraint invoices_gst_mode_check
  check (gst_mode = any (array['none','inclusive','exclusive']));

-- Arithmetic integrity: the stated total must actually reconcile.
--   none/inclusive -> total = subtotal (tax, if any, is already inside)
--   exclusive      -> total = subtotal + tax
alter table public.invoices
  drop constraint if exists invoices_total_reconciles_check;
alter table public.invoices
  add constraint invoices_total_reconciles_check
  check (
    (gst_mode in ('none','inclusive') and total_paise = subtotal_paise)
    or
    (gst_mode = 'exclusive' and total_paise = subtotal_paise + gst_amount_paise)
  );

create index if not exists idx_invoices_clinic_id on public.invoices(clinic_id);
create index if not exists idx_invoices_issued_at on public.invoices(issued_at desc);

-- ------------------------------------------------------------
-- 4. enterprise_leads — public contact form
-- ------------------------------------------------------------

create table if not exists public.enterprise_leads (
  id                    uuid primary key default gen_random_uuid(),
  clinic_name           text not null,
  contact_name          text not null,
  contact_email         text not null,
  contact_phone         text not null,
  doctor_count_estimate integer,
  message               text,
  status                text not null default 'new',
  created_at            timestamptz not null default now()
);

alter table public.enterprise_leads
  drop constraint if exists enterprise_leads_status_check;
alter table public.enterprise_leads
  add constraint enterprise_leads_status_check
  check (status = any (array['new','contacted','converted','declined']));

-- ------------------------------------------------------------
-- 5. Helper functions
-- ------------------------------------------------------------

-- Continuous sequence; does not reset per financial year.
create sequence if not exists public.invoice_number_seq start with 1;

-- Format: CRK/2627/00001  (14 chars, within the GST Rule 46(b) 16-char cap)
create or replace function public.next_invoice_number()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  ist_date date;
  fy_start int;
  fy_label text;
begin
  ist_date := (timezone('Asia/Kolkata', now()))::date;

  -- Indian financial year runs 1 April to 31 March
  fy_start := case
                when extract(month from ist_date) >= 4
                  then extract(year from ist_date)
                else extract(year from ist_date) - 1
              end;

  fy_label := to_char(fy_start % 100, 'FM00')
              || to_char((fy_start + 1) % 100, 'FM00');

  return 'CRK/' || fy_label || '/'
         || lpad(nextval('public.invoice_number_seq')::text, 5, '0');
end;
$$;

-- Seat limit per tier. NULL = unlimited (enterprise, negotiated manually).
create or replace function public.get_tier_doctor_limit(p_tier text)
returns integer
language sql
immutable
as $$
  select case p_tier
    when 'solo'       then 1
    when 'clinic'     then 4
    when 'group'      then 10
    when 'enterprise' then null
    else 1                      -- defensive: unknown tier gets the tightest limit
  end;
$$;

-- Doctors occupying a seat.
-- 'suspended' COUNTS: a doctor on leave keeps their seat, because the clinic
-- backfills with a locum who needs their own login that day.
-- 'removed' does NOT count: departed staff must free their seat, or a clinic
-- can never downgrade and seats leak permanently through normal turnover.
create or replace function public.count_clinic_doctors(p_clinic_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.profiles
  where clinic_id = p_clinic_id
    and role = 'doctor'
    and status in ('active', 'suspended');
$$;

-- ------------------------------------------------------------
-- 6. RLS
--    Reads: clinic-scoped, admin only.
--    Writes: NO policy exists, deliberately. Every insert/update to
--    subscriptions and invoices goes through the service-role client in a
--    server action or the webhook handler. A user session cannot write
--    billing state under any circumstances.
-- ------------------------------------------------------------

alter table public.subscriptions   enable row level security;
alter table public.invoices        enable row level security;
alter table public.enterprise_leads enable row level security;

drop policy if exists subscriptions_admin_select on public.subscriptions;
create policy subscriptions_admin_select
  on public.subscriptions
  for select
  to authenticated
  using (
    clinic_id = public.get_my_clinic_id()
    and public.get_my_is_admin()
  );

drop policy if exists invoices_admin_select on public.invoices;
create policy invoices_admin_select
  on public.invoices
  for select
  to authenticated
  using (
    clinic_id = public.get_my_clinic_id()
    and public.get_my_is_admin()
  );

-- Public contact form. WITH CHECK pins status to 'new' so a caller cannot
-- self-insert a lead as 'converted'.
drop policy if exists enterprise_leads_public_insert on public.enterprise_leads;
create policy enterprise_leads_public_insert
  on public.enterprise_leads
  for insert
  to anon, authenticated
  with check (status = 'new');

-- No SELECT policy on enterprise_leads: leads are read via the Supabase
-- dashboard (service role) only, per the agreed v1 scope.