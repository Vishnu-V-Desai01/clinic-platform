'use server'

import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/supabase/profile'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import {
  requestFamilyAccessSchema,
  accessGrantIdSchema,
  type RequestFamilyAccessInput,
} from './schema'
import type { AccessGrant, FamilyAccessRequestView, FamilyPatientCard } from './types'

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }

const GRANT_DURATION_DAYS = 7

// ============================================================
// DOCTOR-SIDE: request access to a family's records
// ============================================================

export async function requestFamilyAccess(
  input: RequestFamilyAccessInput,
): Promise<ActionResult<AccessGrant>> {
  const profile = await requireRole('doctor')

  const parsed = requestFamilyAccessSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  const supabase = createServerSupabaseClient()

  const { data: familyAccountIdRaw, error: resolveError } = await supabase.rpc(
    'resolve_family_account_code',
    { p_code: parsed.data.familyCode },
  )

  if (resolveError) {
    return { success: false, error: `Could not verify family ID: ${resolveError.message}` }
  }

  const familyAccountId = familyAccountIdRaw as string | null
  if (!familyAccountId) {
    return { success: false, error: 'No family found with that Unique Family ID' }
  }

  const { data: existingPending } = await supabase
    .from('patient_access_grants')
    .select('id')
    .eq('family_account_id', familyAccountId)
    .eq('requesting_doctor_id', profile.id)
    .eq('status', 'pending')
    .maybeSingle()

  if (existingPending) {
    return { success: false, error: 'You already have a pending request for this family' }
  }

  const { data: grant, error: insertError } = await supabase
    .from('patient_access_grants')
    .insert({
      family_account_id: familyAccountId,
      requesting_clinic_id: profile.clinic_id,
      requesting_doctor_id: profile.id,
      request_note: parsed.data.requestNote ?? null,
    })
    .select()
    .single()

  if (insertError) {
    return { success: false, error: `Failed to send access request: ${insertError.message}` }
  }

  revalidatePath('/dashboard')
  return { success: true, data: grant as AccessGrant }
}

export async function listMyAccessRequests(): Promise<ActionResult<AccessGrant[]>> {
  const profile = await requireRole('doctor')
  const supabase = createServerSupabaseClient()

  const { data, error } = await supabase
    .from('patient_access_grants')
    .select('*')
    .eq('requesting_doctor_id', profile.id)
    .order('requested_at', { ascending: false })

  if (error) return { success: false, error: error.message }
  return { success: true, data: (data ?? []) as AccessGrant[] }
}

// NOTE: doctor-side "respond to my own outgoing request" isn't needed —
// a doctor doesn't respond to their own request; the family does
// (approveAccessRequest / denyAccessRequest below). Doctor-side UI for
// viewing request status lives in Chat 22 and reads listMyAccessRequests()
// above; nothing further is needed here for that.

// ============================================================
// PATIENT-SIDE: list + respond to access requests
// ============================================================

export async function listAccessRequestsForMyFamily(): Promise<ActionResult<FamilyAccessRequestView[]>> {
  await requireRole('patient')

  const supabase = createServerSupabaseClient()

  const { data, error } = await supabase.rpc('list_access_requests_for_my_family')

  if (error) return { success: false, error: error.message }

  const rows = (data ?? []) as {
    id: string
    requesting_clinic_name: string
    requesting_doctor_name: string | null
    request_note: string | null
    granted_patient_id: string | null
    status: FamilyAccessRequestView['status']
    requested_at: string
    responded_at: string | null
    expires_at: string | null
  }[]

  return {
    success: true,
    data: rows.map((r) => ({
      id: r.id,
      requestingClinicName: r.requesting_clinic_name,
      requestingDoctorName: r.requesting_doctor_name,
      requestNote: r.request_note,
      grantedPatientId: r.granted_patient_id,
      status: r.status,
      requestedAt: r.requested_at,
      respondedAt: r.responded_at,
      expiresAt: r.expires_at,
    })),
  }
}

export async function listMyFamilyPatientCards(): Promise<ActionResult<FamilyPatientCard[]>> {
  await requireRole('patient')

  const supabase = createServerSupabaseClient()

  const { data, error } = await supabase.rpc('list_my_family_patient_cards')

  if (error) return { success: false, error: error.message }

  const rows = (data ?? []) as {
    id: string
    first_name: string
    last_name: string
    clinic_name: string
    created_at: string
  }[]

  return {
    success: true,
    data: rows.map((r) => ({
      id: r.id,
      firstName: r.first_name,
      lastName: r.last_name,
      clinicName: r.clinic_name,
      createdAt: r.created_at,
    })),
  }
}

export async function approveAccessRequest(
  raw: unknown,
  patientId: string,
): Promise<ActionResult<null>> {
  await requireRole('patient')

  const parsed = accessGrantIdSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: 'Invalid request ID' }
  }

  const grantId = parsed.data
  const supabase = createServerSupabaseClient()

  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + GRANT_DURATION_DAYS)

  const { error } = await supabase
    .from('patient_access_grants')
    .update({
      status: 'approved',
      granted_patient_id: patientId,
      granted_at: new Date().toISOString(),
      expires_at: expiresAt.toISOString(),
    })
    .eq('id', grantId)

  if (error) return { success: false, error: error.message }

  revalidatePath('/portal')
  return { success: true, data: null }
}

export async function denyAccessRequest(raw: unknown): Promise<ActionResult<null>> {
  await requireRole('patient')

  const parsed = accessGrantIdSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: 'Invalid request ID' }
  }

  const grantId = parsed.data
  const supabase = createServerSupabaseClient()

  const { error } = await supabase
    .from('patient_access_grants')
    .update({ status: 'denied' })
    .eq('id', grantId)

  if (error) return { success: false, error: error.message }

  revalidatePath('/portal')
  return { success: true, data: null }
}

export async function revokeAccessGrant(raw: unknown): Promise<ActionResult<null>> {
  await requireRole('patient')

  const parsed = accessGrantIdSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: 'Invalid grant ID' }
  }

  const grantId = parsed.data
  const supabase = createServerSupabaseClient()

  const { error } = await supabase
    .from('patient_access_grants')
    .update({ status: 'revoked' })
    .eq('id', grantId)

  if (error) return { success: false, error: error.message }

  revalidatePath('/portal')
  return { success: true, data: null }
}