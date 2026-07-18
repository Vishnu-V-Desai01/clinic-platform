BEGIN;

-- profiles: admin flag, staff type, account status, and allow "no clinic yet" during signup
ALTER TABLE profiles
  ADD COLUMN is_clinic_admin boolean NOT NULL DEFAULT false,
  ADD COLUMN staff_type text
    CONSTRAINT profiles_staff_type_check
    CHECK (staff_type IS NULL OR staff_type IN ('receptionist','nurse','assistant','pharmacist')),
  ADD COLUMN status text NOT NULL DEFAULT 'active'
    CONSTRAINT profiles_status_check
    CHECK (status IN ('active','suspended','removed')),
  ALTER COLUMN clinic_id DROP NOT NULL;

-- clinics: who owns it, whether it's active
ALTER TABLE clinics
  ADD COLUMN owner_profile_id uuid REFERENCES profiles(id),
  ADD COLUMN status text NOT NULL DEFAULT 'active'
    CONSTRAINT clinics_status_check
    CHECK (status IN ('active','suspended'));

-- invitations: new table
CREATE TABLE invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  email text NOT NULL
    CONSTRAINT invitations_email_format
    CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$'),
  role text NOT NULL
    CONSTRAINT invitations_role_check
    CHECK (role IN ('doctor','staff')),
  staff_type text
    CONSTRAINT invitations_staff_type_check
    CHECK (staff_type IS NULL OR staff_type IN ('receptionist','nurse','assistant','pharmacist')),
  token text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending'
    CONSTRAINT invitations_status_check
    CHECK (status IN ('pending','accepted','expired')),
  invited_by uuid NOT NULL REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days',
  accepted_at timestamptz
);

CREATE UNIQUE INDEX invitations_pending_email_per_clinic
  ON invitations (clinic_id, email)
  WHERE status = 'pending';

ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

-- helper function, same pattern as get_my_role() / get_my_clinic_id()
CREATE OR REPLACE FUNCTION public.get_my_is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT is_clinic_admin FROM profiles WHERE clerk_user_id = (auth.jwt()->>'sub')),
    false
  )
$function$;

-- profiles: admins can see and update teammates in their own clinic
CREATE POLICY profiles_admin_view_clinic_members
ON profiles
FOR SELECT
USING (
  clinic_id = get_my_clinic_id()
  AND get_my_is_admin() = true
);

CREATE POLICY profiles_admin_update_clinic_members
ON profiles
FOR UPDATE
USING (
  clinic_id = get_my_clinic_id()
  AND get_my_is_admin() = true
)
WITH CHECK (
  clinic_id = get_my_clinic_id()
  AND get_my_is_admin() = true
);

-- invitations: clinic-scoped, admin-only
CREATE POLICY invitations_admin_select
ON invitations
FOR SELECT
USING (
  clinic_id = get_my_clinic_id()
  AND get_my_is_admin() = true
);

CREATE POLICY invitations_admin_insert
ON invitations
FOR INSERT
WITH CHECK (
  clinic_id = get_my_clinic_id()
  AND get_my_is_admin() = true
  AND invited_by = (SELECT id FROM profiles WHERE clerk_user_id = (auth.jwt()->>'sub'))
);

CREATE POLICY invitations_admin_update
ON invitations
FOR UPDATE
USING (
  clinic_id = get_my_clinic_id()
  AND get_my_is_admin() = true
)
WITH CHECK (
  clinic_id = get_my_clinic_id()
  AND get_my_is_admin() = true
);

COMMIT;