-- Seed the one clinic with a fixed, known id
insert into clinics (id, name) values
  ('11111111-1111-1111-1111-111111111111', 'My Clinic')
on conflict (id) do nothing;

-- The profiles table: links a Clerk user to a role and a clinic
create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  clerk_user_id text not null unique,
  email text not null,
  full_name text,
  role text not null check (role in ('doctor', 'staff', 'patient')),
  clinic_id uuid not null references clinics(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Turn on Row Level Security
alter table clinics enable row level security;
alter table profiles enable row level security;

-- Any logged-in user can read basic clinic info
drop policy if exists "Authenticated users can view clinics" on clinics;
create policy "Authenticated users can view clinics"
on clinics for select
to authenticated
using (true);

-- Users can view their own profile
drop policy if exists "Users can view their own profile" on profiles;
create policy "Users can view their own profile"
on profiles for select
to authenticated
using (clerk_user_id = (auth.jwt()->>'sub'));

-- Users can create their own profile — but only as a patient.
-- Doctor/staff roles are set manually via the Table Editor.
drop policy if exists "Users can create their own profile as a patient" on profiles;
create policy "Users can create their own profile as a patient"
on profiles for insert
to authenticated
with check (
  clerk_user_id = (auth.jwt()->>'sub')
  and role = 'patient'
);

-- Reusable helpers for RLS policies on future tables
create or replace function get_my_role()
returns text
language sql
stable
as $$
  select role from profiles where clerk_user_id = (auth.jwt()->>'sub')
$$;

create or replace function get_my_clinic_id()
returns uuid
language sql
stable
as $$
  select clinic_id from profiles where clerk_user_id = (auth.jwt()->>'sub')
$$;