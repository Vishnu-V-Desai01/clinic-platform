import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/supabase/profile'
import { getAdminDashboardKpis, getClinicActivity } from '@/features/admin-dashboard/actions'
import { listPendingInvitations } from '@/features/invitations/actions'
import { listClinicUsers } from '@/features/clinic-users/actions'
import { AdminDashboardClient } from '@/features/admin-dashboard/components/AdminDashboardClient'

export default async function AdminDashboardPage() {
  const profile = await requireRole('doctor', 'staff')

  if (!profile.is_clinic_admin) {
    redirect('/dashboard')
  }

  const [kpisResult, activityResult, invitationsResult, usersResult] = await Promise.all([
    getAdminDashboardKpis(),
    getClinicActivity(),
    listPendingInvitations(),
    listClinicUsers(),
  ])

  return (
    <AdminDashboardClient
      kpis={kpisResult.success ? kpisResult.data : undefined}
      activitySeries={activityResult.success ? activityResult.data : undefined}
      pendingInvitations={
        invitationsResult.success
          ? invitationsResult.data.map((inv) => ({
              id: inv.id,
              email: inv.email,
              role: inv.role,
              staffType: inv.staff_type,
              sentAt: inv.created_at,
            }))
          : []
      }
      hasTeamMembers={usersResult.success && usersResult.data.length > 1}
    />
  )
}