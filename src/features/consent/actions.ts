'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/supabase/profile'
import { grantConsentSchema, revokeConsentSchema } from './schema'
import type { PatientConsent, ConsentPurpose } from './types'

type ActionResult = { success: true } | { success: false; error: string }

// ─── Read ─────────────────────────────────────────────────────────────────────

// Fetch all consent records for a patient (active and revoked).
// Server components call this to render the consent section.
export async function getPatientConsents(
  patientId: string,
): Promise<PatientConsent[]> {
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

// Check whether one specific consent purpose is currently active.
// Other features (WhatsApp, Care Plans) call this before acting.
export async function hasActiveConsent(
  patientId: string,
  purpose: ConsentPurpose,
): Promise<boolean> {
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

// ─── Mutations ────────────────────────────────────────────────────────────────

// Grant (or re-grant) consent for one purpose.
// Upsert: if a record already exists for that patient + purpose it is
// re-activated in place rather than creating a duplicate row.
export async function grantConsent(raw: unknown): Promise<ActionResult> {
  const profile = await requireRole('doctor', 'staff')

  const parsed = grantConsentSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Invalid input',
    }
  }

  const { patient_id, purpose, notes } = parsed.data
  const supabase = createServerSupabaseClient()
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

  revalidatePath(`/patients/${patient_id}`)
  return { success: true }
}

// Revoke an existing consent.
// The row is NEVER deleted — is_active is set to false and the revoker is
// recorded. This keeps the full DPDP audit trail intact.
export async function revokeConsent(
  raw: unknown,
  patientId: string,
): Promise<ActionResult> {
  const profile = await requireRole('doctor', 'staff')

  const parsed = revokeConsentSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Invalid input',
    }
  }

  const { consent_id, notes } = parsed.data
  const supabase = createServerSupabaseClient()
  const now = new Date().toISOString()

  const { error } = await supabase
    .from('patient_consents')
    .update({
      is_active:  false,
      revoked_by: profile.id,
      revoked_at: now,
      notes:      notes ?? null,
      updated_at: now,
    })
    .eq('id', consent_id)

  if (error) return { success: false, error: error.message }

  revalidatePath(`/patients/${patientId}`)
  return { success: true }
}