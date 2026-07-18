'use server'

import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { acceptStaffInvitation } from '@/lib/supabase/profile'

export type InvitationLookup = {
  clinicName: string
  role: 'doctor' | 'staff'
  staffType: 'receptionist' | 'nurse' | 'assistant' | 'pharmacist' | null
  status: 'pending' | 'accepted' | 'expired'
  expiresAt: string
  isExpired: boolean
  invitedEmail: string
} | null

type InvitationTokenRow = {
  clinic_name: string
  role: string
  staff_type: string | null
  status: string
  expires_at: string
  invited_email: string
}

export async function lookupInvitationByToken(token: string): Promise<InvitationLookup> {
  const supabase = createServerSupabaseClient()

  const { data, error } = await supabase
    .rpc('get_invitation_by_token', { p_token: token })
    .maybeSingle()

  if (error || !data) return null

  const row = data as InvitationTokenRow

  return {
    clinicName: row.clinic_name,
    role: row.role as 'doctor' | 'staff',
    staffType: row.staff_type as 'receptionist' | 'nurse' | 'assistant' | 'pharmacist' | null,
    status: row.status as 'pending' | 'accepted' | 'expired',
    expiresAt: row.expires_at,
    isExpired: new Date(row.expires_at) < new Date(),
    invitedEmail: row.invited_email,
  }
}

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }

export async function acceptInvitationAction(
  token: string,
  fullName: string
): Promise<ActionResult<null>> {
  if (!fullName.trim()) {
    return { success: false, error: 'Please enter your full name' }
  }

  try {
    await acceptStaffInvitation(token, fullName)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to accept invitation'
    return { success: false, error: message }
  }

  redirect('/dashboard')
}