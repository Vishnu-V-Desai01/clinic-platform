import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/supabase/profile'
import { listClinicUsers } from '@/features/clinic-users/actions'
import { TeamMembersClient } from '@/features/clinic-users/components/TeamMembersClient'

export default async function TeamMembersPageRoute() {
  const profile = await requireRole('doctor', 'staff')

  if (!profile.is_clinic_admin) {
    redirect('/dashboard')
  }

  const result = await listClinicUsers()

  return <TeamMembersClient users={result.success ? result.data : []} />
}