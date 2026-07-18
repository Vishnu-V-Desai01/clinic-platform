'use server'

import { randomBytes } from 'crypto'
import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/supabase/profile'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createInvitationSchema, type CreateInvitationInput } from './schema'
import type { Invitation } from './types'

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }

export async function createInvitation(
  input: CreateInvitationInput
): Promise<ActionResult<Invitation>> {
  const profile = await requireRole('doctor', 'staff')

  if (!profile.is_clinic_admin) {
    return { success: false, error: 'Only clinic admins can send invitations' }
  }

  const parsed = createInvitationSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  const { email, role, staffType } = parsed.data
  const supabase = createServerSupabaseClient()

  const { data: emailStatus, error: statusError } = await supabase.rpc(
    'check_invitation_email_status',
    { p_email: email }
  )

  if (statusError) {
    return { success: false, error: `Could not verify email: ${statusError.message}` }
  }

  if (emailStatus === 'already_in_your_clinic') {
    return { success: false, error: 'This person is already part of your clinic' }
  }

  if (emailStatus === 'already_in_another_clinic') {
    return {
      success: false,
      error: 'This email is already registered as a doctor or staff member at another clinic',
    }
  }

  const { data: existingPending } = await supabase
    .from('invitations')
    .select('id')
    .eq('clinic_id', profile.clinic_id as string)
    .eq('email', email)
    .eq('status', 'pending')
    .maybeSingle()

  if (existingPending) {
    return { success: false, error: 'An invitation is already pending for this email' }
  }

  const token = randomBytes(32).toString('hex')

  const { data: invitation, error: insertError } = await supabase
    .from('invitations')
    .insert({
      clinic_id: profile.clinic_id,
      email,
      role,
      staff_type: staffType,
      token,
      invited_by: profile.id,
    })
    .select()
    .single()

  if (insertError) {
    return { success: false, error: `Failed to create invitation: ${insertError.message}` }
  }

  revalidatePath('/dashboard/admin/users')

  return { success: true, data: invitation as Invitation }
}

export async function listPendingInvitations(): Promise<ActionResult<Invitation[]>> {
  const profile = await requireRole('doctor', 'staff')

  if (!profile.is_clinic_admin) {
    return { success: false, error: 'Only clinic admins can view invitations' }
  }

  const supabase = createServerSupabaseClient()

  const { data, error } = await supabase
    .from('invitations')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  if (error) {
    return { success: false, error: `Failed to load invitations: ${error.message}` }
  }

  return { success: true, data: data as Invitation[] }
}

export async function revokeInvitation(invitationId: string): Promise<ActionResult<null>> {
  const profile = await requireRole('doctor', 'staff')

  if (!profile.is_clinic_admin) {
    return { success: false, error: 'Only clinic admins can revoke invitations' }
  }

  const supabase = createServerSupabaseClient()

  const { error } = await supabase
    .from('invitations')
    .update({ status: 'expired' })
    .eq('id', invitationId)
    .eq('status', 'pending')

  if (error) {
    return { success: false, error: `Failed to revoke invitation: ${error.message}` }
  }

  revalidatePath('/dashboard/admin/users')

  return { success: true, data: null }
}