-- CURAKIN: add the 'pharmacist' role value.
-- Isolated in its own migration because Postgres forbids using a newly added
-- enum value inside the same transaction that created it. The RLS policies in
-- the next migration reference 'pharmacist', so this must commit first.

do $$
declare
  v_udt text;
begin
  select c.udt_name
    into v_udt
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name   = 'profiles'
    and c.column_name  = 'role';

  if v_udt is null then
    raise exception 'CURAKIN: public.profiles.role column not found - aborting.';

  elsif v_udt in ('text', 'varchar', 'bpchar') then
    -- Free text (possibly with a CHECK constraint). Nothing to add here.
    raise notice 'CURAKIN: profiles.role is %; no enum value required. If a CHECK constraint restricts role values, it must be widened manually.', v_udt;

  else
    execute format('alter type public.%I add value if not exists %L', v_udt, 'pharmacist');
    raise notice 'CURAKIN: ensured value ''pharmacist'' exists on enum type public.%', v_udt;
  end if;
end
$$;