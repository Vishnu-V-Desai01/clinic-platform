'use server'

import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/supabase/profile'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { clinicUserIdSchema } from './schema'
import type { ClinicUser } from './types'

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }

export async function listClinicUsers(): Promise<ActionResult<ClinicUser[]>> {
  const profile = await requireRole('doctor', 'staff')

  if (!profile.is_clinic_admin) {
    return { success: false, error: 'Only clinic admins can view clinic users' }
  }

  const supabase = createServerSupabaseClient()

  const { data, error } = await supabase
    .from('profiles')
    .select('id, clerk_user_id, email, full_name, role, clinic_id, is_clinic_admin, staff_type, status, created_at')
    .in('role', ['doctor', 'staff'])
    .order('created_at', { ascending: true })

  if (error) {
    return { success: false, error: `Failed to load clinic users: ${error.message}` }
  }

  return { success: true, data: data as ClinicUser[] }
}

async function countActiveAdmins(clinicId: string): Promise<number> {
  const supabase = createServerSupabaseClient()

  const { count, error } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('clinic_id', clinicId)
    .eq('is_clinic_admin', true)
    .eq('status', 'active')

  if (error) throw new Error(`Failed to count active admins: ${error.message}`)
  return count ?? 0
}

export async function suspendUser(targetProfileId: string): Promise<ActionResult<null>> {
  const profile = await requireRole('doctor', 'staff')

  if (!profile.is_clinic_admin) {
    return { success: false, error: 'Only clinic admins can suspend users' }
  }

  const parsed = clinicUserIdSchema.safeParse(targetProfileId)
  if (!parsed.success) {
    return { success: false, error: 'Invalid user ID' }
  }

  if (targetProfileId === profile.id) {
    const activeAdminCount = await countActiveAdmins(profile.clinic_id as string)
    if (activeAdminCount <= 1) {
      return {
        success: false,
        error: "You're the last admin — suspend another admin first, or transfer admin rights before suspending yourself",
      }
    }
  }

  const supabase = createServerSupabaseClient()

  const { data, error } = await supabase
    .from('profiles')
    .update({ status: 'suspended' })
    .eq('id', targetProfileId)
    .select()
    .maybeSingle()

  if (error) {
    return { success: false, error: `Failed to suspend user: ${error.message}` }
  }

  if (!data) {
    return { success: false, error: 'User not found, or not part of your clinic' }
  }

  revalidatePath('/dashboard/admin/users')

  return { success: true, data: null }
}

export async function reactivateUser(targetProfileId: string): Promise<ActionResult<null>> {
  const profile = await requireRole('doctor', 'staff')

  if (!profile.is_clinic_admin) {
    return { success: false, error: 'Only clinic admins can reactivate users' }
  }

  const parsed = clinicUserIdSchema.safeParse(targetProfileId)
  if (!parsed.success) {
    return { success: false, error: 'Invalid user ID' }
  }

  const supabase = createServerSupabaseClient()

  const { data, error } = await supabase
    .from('profiles')
    .update({ status: 'active' })
    .eq('id', targetProfileId)
    .select()
    .maybeSingle()

  if (error) {
    return { success: false, error: `Failed to reactivate user: ${error.message}` }
  }

  if (!data) {
    return { success: false, error: 'User not found, or not part of your clinic' }
  }

  revalidatePath('/dashboard/admin/users')

  return { success: true, data: null }
}

export async function removeUser(targetProfileId: string): Promise<ActionResult<null>> {
  const profile = await requireRole('doctor', 'staff')

  if (!profile.is_clinic_admin) {
    return { success: false, error: 'Only clinic admins can remove users' }
  }

  const parsed = clinicUserIdSchema.safeParse(targetProfileId)
  if (!parsed.success) {
    return { success: false, error: 'Invalid user ID' }
  }

  if (targetProfileId === profile.id) {
    const activeAdminCount = await countActiveAdmins(profile.clinic_id as string)
    if (activeAdminCount <= 1) {
      return { success: false, error: "You're the last admin — you can't remove yourself. Assign another admin first." }
    }
  }

  const supabase = createServerSupabaseClient()

  const { data, error } = await supabase
    .from('profiles')
    .update({ status: 'removed' })
    .eq('id', targetProfileId)
    .select()
    .maybeSingle()

  if (error) {
    return { success: false, error: `Failed to remove user: ${error.message}` }
  }

  if (!data) {
    return { success: false, error: 'User not found, or not part of your clinic' }
  }

  revalidatePath('/dashboard/admin/users')

  return { success: true, data: null }
}