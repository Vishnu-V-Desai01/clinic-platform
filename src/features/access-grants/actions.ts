'use server'

import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/supabase/profile'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import {
  requestFamilyAccessSchema,
  respondToAccessRequestSchema,
  accessGrantIdSchema,
  type RequestFamilyAccessInput,
  type RespondToAccessRequestInput,
} from './schema'
import type { AccessGrant, FamilyAccessRequestView, FamilyPatientCard } from './types'

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }

const GRANT_DURATION_DAYS = 7

// ============================================================
// DOCTOR-SIDE: request access to a family's records
// ============================================================

// A doctor requests access using the family's "Unique Family ID"
// (shown on the family's dashboard, shared with the doctor however
// the patient chooses to). This only ever creates a pending
// request — nothing is visible to the doctor until the family
// responds and picks a specific card.
export async function requestFamilyAccess(
  input: RequestFamilyAccessInput
): Promise<ActionResult<AccessGrant>> {
  const profile = await requireRole('doctor')

  const parsed = requestFamilyAccessSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  const supabase = createServerSupabaseClient()

  const { data: familyAccountIdRaw, error: resolveError } = await supabase.rpc(
    'resolve_family_account_code',
    { p_code: parsed.data.familyCode }
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

  // Placeholder path — this route doesn't exist yet (Chat 21 UI).
  revalidatePath('/dashboard/patient-history')

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

  if (error) {
    return { success: false, error: `Failed to load your requests: ${error.message}` }
  }

  return { success: true, data: data as AccessGrant[] }
}

// ============================================================
// FAMILY-SIDE: review requests, grant/deny/revoke access
// ============================================================

export async function listAccessRequestsForMyFamily(): Promise<ActionResult<FamilyAccessRequestView[]>> {
  await requireRole('patient')

  const supabase = createServerSupabaseClient()

  const { data, error } = await supabase.rpc('list_access_requests_for_my_family')

  if (error) {
    return { success: false, error: `Failed to load access requests: ${error.message}` }
  }

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

  if (error) {
    return { success: false, error: `Failed to load patient cards: ${error.message}` }
  }

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

// Approves a pending request and attaches the specific card the
// family manager chose. status and granted_patient_id are set in
// the SAME update deliberately — the
// patient_access_grants_card_requires_response CHECK constraint
// only allows granted_patient_id to be non-null once status is
// approved/revoked/expired, so setting them in two separate writes
// would fail on the first one.
//
// NOTE: only reachable through the app as written — the
// .eq('status', 'pending') filter below is what stops a family
// member from re-approving an already-responded request with a
// different card. RLS itself doesn't block that (it only checks the
// card belongs to their own family), so someone calling the
// Supabase API directly, bypassing this action, technically could.
// Since it's only ever their own family's data being touched — not
// a cross-family leak — this is being accepted as a known minor
// gap rather than added RLS complexity. Flag if you want it closed.
export async function approveAccessRequest(
  input: RespondToAccessRequestInput
): Promise<ActionResult<null>> {
  await requireRole('patient')

  const parsed = respondToAccessRequestSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  const supabase = createServerSupabaseClient()

  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + GRANT_DURATION_DAYS)

  const { data, error } = await supabase
    .from('patient_access_grants')
    .update({
      status: 'approved',
      granted_patient_id: parsed.data.patientId,
      responded_at: new Date().toISOString(),
      expires_at: expiresAt.toISOString(),
    })
    .eq('id', parsed.data.requestId)
    .eq('status', 'pending')
    .select()
    .maybeSingle()

  if (error) {
    return { success: false, error: `Failed to approve request: ${error.message}` }
  }

  if (!data) {
    return {
      success: false,
      error: 'Request not found, already responded to, or not yours to approve',
    }
  }

  // Placeholder path — this route doesn't exist yet (Chat 21 UI).
  revalidatePath('/dashboard/family')

  return { success: true, data: null }
}

export async function denyAccessRequest(requestId: string): Promise<ActionResult<null>> {
  await requireRole('patient')

  const parsed = accessGrantIdSchema.safeParse(requestId)
  if (!parsed.success) {
    return { success: false, error: 'Invalid request ID' }
  }

  const supabase = createServerSupabaseClient()

  const { data, error } = await supabase
    .from('patient_access_grants')
    .update({
      status: 'denied',
      responded_at: new Date().toISOString(),
    })
    .eq('id', requestId)
    .eq('status', 'pending')
    .select()
    .maybeSingle()

  if (error) {
    return { success: false, error: `Failed to deny request: ${error.message}` }
  }

  if (!data) {
    return {
      success: false,
      error: 'Request not found, already responded to, or not yours to deny',
    }
  }

  revalidatePath('/dashboard/family')

  return { success: true, data: null }
}

// Ends an already-approved grant early, before its 7-day window
// naturally expires. Doesn't touch granted_patient_id — the CHECK
// constraint still allows it to stay set once status is 'revoked'.
export async function revokeAccessGrant(requestId: string): Promise<ActionResult<null>> {
  await requireRole('patient')

  const parsed = accessGrantIdSchema.safeParse(requestId)
  if (!parsed.success) {
    return { success: false, error: 'Invalid request ID' }
  }

  const supabase = createServerSupabaseClient()

  const { data, error } = await supabase
    .from('patient_access_grants')
    .update({ status: 'revoked' })
    .eq('id', requestId)
    .eq('status', 'approved')
    .select()
    .maybeSingle()

  if (error) {
    return { success: false, error: `Failed to revoke access: ${error.message}` }
  }

  if (!data) {
    return { success: false, error: 'Grant not found, or not currently active' }
  }

  revalidatePath('/dashboard/family')

  return { success: true, data: null }
}