'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import AdminDashboard from './AdminDashboard'
import { revokeInvitation } from '@/features/invitations/actions'
import type { AdminDashboardKpis, ActivityPoint, DiscountedMedicineBill } from '../types'

type PendingInvitationView = {
  id: string
  email: string
  role: 'doctor' | 'staff'
  staffType: string | null
  sentAt: string
}

type Props = {
  kpis?: AdminDashboardKpis
  activitySeries?: ActivityPoint[]
  pendingInvitations: PendingInvitationView[]
  hasTeamMembers: boolean
  discountedMedicineBills?: DiscountedMedicineBill[]
}

export function AdminDashboardClient({
  kpis,
  activitySeries,
  pendingInvitations,
  hasTeamMembers,
  discountedMedicineBills,
}: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  function handleInviteUser() {
    router.push('/dashboard/admin/users')
  }

  function handleRevoke(invitationId: string) {
    startTransition(async () => {
      await revokeInvitation(invitationId)
      router.refresh()
    })
  }

  function handleSwitchToDoctor() {
    router.push('/dashboard/patients')
  }

  return (
    <AdminDashboard
      kpis={kpis}
      activitySeries={activitySeries}
      pendingInvitations={pendingInvitations}
      hasTeamMembers={hasTeamMembers}
      discountedMedicineBills={discountedMedicineBills}
      onInviteUser={handleInviteUser}
      onRevoke={handleRevoke}
      onSwitchToDoctor={handleSwitchToDoctor}
    />
  )
}