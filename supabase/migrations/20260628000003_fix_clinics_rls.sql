-- ============================================================================
-- Fix clinics RLS — remove policies referencing the unused `users` table,
-- replace with get_my_clinic_id() consistent with all other tables.
-- ============================================================================

-- Drop all existing clinics policies
DROP POLICY IF EXISTS "Authenticated users can view clinics" ON clinics;
DROP POLICY IF EXISTS "users_view_own_clinic" ON clinics;
DROP POLICY IF EXISTS "clinics_insert_restrict" ON clinics;
DROP POLICY IF EXISTS "clinics_update_restrict" ON clinics;

-- SELECT: any authenticated clinic member can read their own clinic row
CREATE POLICY "clinic_members_select_own"
  ON clinics FOR SELECT
  TO authenticated
  USING (id = get_my_clinic_id());

-- UPDATE: only allowed via server actions (service key bypasses RLS),
-- but add a permissive policy so doctor updates work via the anon key too
CREATE POLICY "clinic_members_update_own"
  ON clinics FOR UPDATE
  TO authenticated
  USING (id = get_my_clinic_id())
  WITH CHECK (id = get_my_clinic_id());

-- INSERT: blocked from client — clinics are created by platform only
CREATE POLICY "clinic_insert_blocked"
  ON clinics FOR INSERT
  TO authenticated
  WITH CHECK (false);