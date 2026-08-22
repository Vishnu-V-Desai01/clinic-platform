'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/supabase/profile'
import { grantConsentSchema, revokeConsentSchema } from './schema'
import type { PatientConsent, ConsentPurpose } from './types'

type ActionResult = { success: true } | { success: false; error: string }

// Named result types — avoid multiline generic return type syntax
// which gets stripped as HTML when copy-pasted from web interfaces.
type ConsentListResult = { success: true; data: PatientConsent[] } | { success: false; error: string }

// ─── CLINIC-SIDE (doctor / staff) ────────────────────────────────────────────

export async function getPatientConsents(patientId: string): Promise<PatientConsent[]> {
  await requireRole('doctor', 'staff')
  const supabase = createServerSupabaseClient()

  const { data, error } = await supabase
    .from('patient_consents')
    .select('*')
    .eq('patient_id', patientId)
    .order('purpose')

  if (error) throw new Error(error.message)
  return (data ?? []) as PatientConsent[]
}

export async function hasActiveConsent(patientId: string, purpose: ConsentPurpose): Promise<boolean> {
  await requireRole('doctor', 'staff')
  const supabase = createServerSupabaseClient()

  const { data, error } = await supabase
    .from('patient_consents')
    .select('id')
    .eq('patient_id', patientId)
    .eq('purpose', purpose)
    .eq('is_active', true)
    .maybeSingle()

  if (error) return false
  return data !== null
}

export async function grantConsent(raw: unknown): Promise<ActionResult> {
  const profile = await requireRole('doctor', 'staff')

  const parsed = grantConsentSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  const { patient_id, purpose, notes } = parsed.data
  const supabase = createServerSupabaseClient()

  const { data: patient, error: patientError } = await supabase
    .from('patients')
    .select('id')
    .eq('id', patient_id)
    .eq('clinic_id', profile.clinic_id)
    .is('deleted_at', null)
    .maybeSingle()

  if (patientError) return { success: false, error: patientError.message }
  if (!patient) return { success: false, error: 'Patient not found.' }

  const now = new Date().toISOString()

  const { error } = await supabase.from('patient_consents').upsert(
    {
      clinic_id:  profile.clinic_id,
      patient_id,
      purpose,
      is_active:  true,
      granted_by: profile.id,
      granted_at: now,
      revoked_by: null,
      revoked_at: null,
      notes:      notes ?? null,
      updated_at: now,
    },
    { onConflict: 'patient_id,purpose' },
  )

  if (error) return { success: false, error: error.message }

  revalidatePath(`/dashboard/patients/${patient_id}`)
  return { success: true }
}

export async function revokeConsent(raw: unknown, patientId: string): Promise<ActionResult> {
  const profile = await requireRole('doctor', 'staff')

  const parsed = revokeConsentSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  const { consent_id, notes } = parsed.data
  const supabase = createServerSupabaseClient()
  const now = new Date().toISOString()

  const { data, error } = await supabase
    .from('patient_consents')
    .update({
      is_active:  false,
      revoked_by: profile.id,
      revoked_at: now,
      notes:      notes ?? null,
      updated_at: now,
    })
    .eq('id', consent_id)
    .eq('clinic_id', profile.clinic_id)
    .select('id')
    .single()

  if (error) return { success: false, error: error.message }
  if (!data) return { success: false, error: 'Consent record not found.' }

  revalidatePath(`/dashboard/patients/${patientId}`)
  return { success: true }
}

// ─── PATIENT-SIDE (self-service) ──────────────────────────────────────────────

// Returns all consent records across every card in the patient's family.
// RLS (patient_consents_select_patient_own) scopes results automatically.
export async function getMyAllConsents(): Promise<ConsentListResult> {
  await requireRole('patient')
  const supabase = createServerSupabaseClient()

  const { data, error } = await supabase
    .from('patient_consents')
    .select('*')
    .order('purpose')

  if (error) return { success: false, error: error.message }
  return { success: true, data: (data ?? []) as PatientConsent[] }
}

// Returns consents for one specific patient card.
export async function getMyConsentsForCard(patientId: string): Promise<ConsentListResult> {
  await requireRole('patient')
  const supabase = createServerSupabaseClient()

  const { data, error } = await supabase
    .from('patient_consents')
    .select('*')
    .eq('patient_id', patientId)
    .order('purpose')

  if (error) return { success: false, error: error.message }
  return { success: true, data: (data ?? []) as PatientConsent[] }
}

// Patient grants (or re-grants) consent for one purpose on one of their own
// cards. clinic_id is fetched from the patients row — RLS on patients
// restricts what they can read to their own cards, so they cannot forge it.
export async function grantConsentAsPatient(raw: unknown): Promise<ActionResult> {
  const profile = await requireRole('patient')

  const parsed = grantConsentSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  const { patient_id, purpose, notes } = parsed.data
  const supabase = createServerSupabaseClient()

  const { data: patientRow, error: pErr } = await supabase
    .from('patients')
    .select('clinic_id')
    .eq('id', patient_id)
    .is('deleted_at', null)
    .maybeSingle()

  if (pErr) return { success: false, error: pErr.message }
  if (!patientRow) return { success: false, error: 'Patient card not found or does not belong to your account.' }

  const now = new Date().toISOString()

  const { error } = await supabase.from('patient_consents').upsert(
    {
      clinic_id:  patientRow.clinic_id,
      patient_id,
      purpose,
      is_active:  true,
      granted_by: profile.id,
      granted_at: now,
      revoked_by: null,
      revoked_at: null,
      notes:      notes ?? null,
      updated_at: now,
    },
    { onConflict: 'patient_id,purpose' },
  )

  if (error) return { success: false, error: error.message }

  revalidatePath('/portal/consents')
  return { success: true }
}

// Patient revokes one of their own consents. Row is never deleted —
// is_active = false keeps the DPDP audit trail intact.
// RLS UPDATE policy (patient_consents_update_patient_own) enforces
// family ownership at the DB level.
export async function revokeConsentAsPatient(raw: unknown): Promise<ActionResult> {
  const profile = await requireRole('patient')

  const parsed = revokeConsentSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  const { consent_id, notes } = parsed.data
  const supabase = createServerSupabaseClient()
  const now = new Date().toISOString()

  const { data, error } = await supabase
    .from('patient_consents')
    .update({
      is_active:  false,
      revoked_by: profile.id,
      revoked_at: now,
      notes:      notes ?? null,
      updated_at: now,
    })
    .eq('id', consent_id)
    .select('id')
    .single()

  if (error) return { success: false, error: error.message }
  if (!data) return { success: false, error: 'Consent record not found.' }

  revalidatePath('/portal/consents')
  return { success: true }
}