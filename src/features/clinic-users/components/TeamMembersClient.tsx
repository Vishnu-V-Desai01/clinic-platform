'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import TeamMembersPage from './TeamMembersPage'
import { createInvitation } from '@/features/invitations/actions'
import { suspendUser, reactivateUser, removeUser } from '@/features/clinic-users/actions'
import type { ClinicUser } from '../types'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Copy, Check } from 'lucide-react'

type TeamMember = {
  id: string
  name: string
  role: 'doctor' | 'staff'
  staffType?: 'receptionist' | 'nurse' | 'assistant' | 'pharmacist' | null
  status: 'active' | 'suspended' | 'removed'
  lastActive: string | null
}

export function TeamMembersClient({ users }: { users: ClinicUser[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const members: TeamMember[] = users.map((u) => ({
    id: u.id,
    name: u.full_name ?? u.email,
    role: u.role as 'doctor' | 'staff',
    staffType: u.staff_type,
    status: u.status,
    lastActive: null,
  }))

  function handleInvite(values: { email: string; role: 'doctor' | 'staff'; staffType?: string | null }) {
    startTransition(async () => {
      const result = await createInvitation({
        email: values.email,
        role: values.role,
        staffType: (values.staffType ?? null) as 'receptionist' | 'nurse' | 'assistant' | 'pharmacist' | null,
      })
      if (!result.success) {
        window.alert(result.error)
        return
      }
      // Show the copyable invite link — admin sends this to the invitee manually
      const link = `${window.location.origin}/accept-invitation?token=${result.data.token}`
      setInviteLink(link)
      router.refresh()
    })
  }

  function handleCopy() {
    if (!inviteLink) return
    navigator.clipboard.writeText(inviteLink).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  function handleSuspend(id: string) {
    startTransition(async () => {
      const result = await suspendUser(id)
      if (!result.success) window.alert(result.error)
      router.refresh()
    })
  }

  function handleReactivate(id: string) {
    startTransition(async () => {
      const result = await reactivateUser(id)
      if (!result.success) window.alert(result.error)
      router.refresh()
    })
  }

  function handleRemove(id: string) {
    startTransition(async () => {
      const result = await removeUser(id)
      if (!result.success) window.alert(result.error)
      router.refresh()
    })
  }

  return (
    <>
      <TeamMembersPage
        members={members}
        isLoading={isPending}
        onInvite={handleInvite}
        onSuspend={handleSuspend}
        onReactivate={handleReactivate}
        onRemove={handleRemove}
        onSwitchToDoctor={() => router.push('/dashboard/patients')}
      />

      {/* Invitation link dialog — shown after successful invite creation */}
      <Dialog open={!!inviteLink} onOpenChange={(open) => { if (!open) setInviteLink(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Invitation created</DialogTitle>
            <DialogDescription>
              Copy this link and send it to the invitee. It expires in 7 days and can only be used once.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Input
              readOnly
              value={inviteLink ?? ''}
              className="text-xs font-mono"
              onClick={(e) => (e.target as HTMLInputElement).select()}
            />
            <Button variant="outline" size="sm" onClick={handleCopy} className="shrink-0">
              {copied
                ? <><Check className="h-4 w-4 mr-1 text-emerald-500" /> Copied</>
                : <><Copy className="h-4 w-4 mr-1" /> Copy</>
              }
            </Button>
          </div>
          <Button onClick={() => setInviteLink(null)} className="w-full mt-2">Done</Button>
        </DialogContent>
      </Dialog>
    </>
  )
}