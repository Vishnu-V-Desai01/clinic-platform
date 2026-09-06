// src/features/clinical-snippets/actions.ts
//
// Item 7a: CRUD for doctor-scoped clinical note snippets. Every function
// independently re-checks role === 'doctor' and scopes every query to
// doctor_id = profile.id — defence in depth alongside the RLS policies on
// clinical_note_snippets (doctor_id = get_my_profile_id() AND clinic_id =
// get_my_clinic_id(), matching the daily_metrics/anomaly_alerts pattern).

'use server'

import { revalidatePath } from 'next/cache'
import { getOrCreateProfile } from '@/lib/supabase/profile'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { snippetFormSchema } from './schema'
import type { ClinicalNoteSnippet } from './types'

type Result<T> =
  | { success: true; data: T }
  | { success: false; error: string }

function toSnippet(row: {
  id: string
  title: string
  body: string
  created_at: string
  updated_at: string
}): ClinicalNoteSnippet {
  return {
    id:        row.id,
    title:     row.title,
    body:      row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function listSnippets(): Promise<Result<ClinicalNoteSnippet[]>> {
  const profile = await getOrCreateProfile()
  if (!profile || profile.role !== 'doctor') {
    return { success: false, error: 'Only doctors can access clinical note snippets.' }
  }
  if (!profile.clinic_id) {
    return { success: false, error: 'Your account is not linked to a clinic.' }
  }

  try {
    const supabase = createServerSupabaseClient()
    const { data, error } = await supabase
      .from('clinical_note_snippets')
      .select('*')
      .eq('doctor_id', profile.id)
      .eq('clinic_id', profile.clinic_id)
      .order('title', { ascending: true })

    if (error) throw error
    return { success: true, data: (data ?? []).map(toSnippet) }
  } catch (err) {
    console.error('[listSnippets]', err)
    return { success: false, error: 'Failed to load snippets.' }
  }
}

// Used by EncounterCard's insert control during a visit. Same query and
// scoping as listSnippets — kept as a distinct export so the two call
// sites (management modal vs. in-wizard insert dropdown) can diverge later
// without one change silently affecting the other.
export async function listSnippetsForInsert(): Promise<Result<ClinicalNoteSnippet[]>> {
  return listSnippets()
}

export async function createSnippet(raw: unknown): Promise<Result<ClinicalNoteSnippet>> {
  const profile = await getOrCreateProfile()
  if (!profile || profile.role !== 'doctor') {
    return { success: false, error: 'Only doctors can create clinical note snippets.' }
  }
  if (!profile.clinic_id) {
    return { success: false, error: 'Your account is not linked to a clinic.' }
  }

  const parsed = snippetFormSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Please check the form and try again.' }
  }

  try {
    const supabase = createServerSupabaseClient()
    const { data, error } = await supabase
      .from('clinical_note_snippets')
      .insert({
        clinic_id: profile.clinic_id,
        doctor_id: profile.id,
        title:     parsed.data.title,
        body:      parsed.data.body,
      })
      .select('*')
      .single()

    if (error) throw error

    revalidatePath('/dashboard/snippets')
    return { success: true, data: toSnippet(data) }
  } catch (err) {
    console.error('[createSnippet]', err)
    return { success: false, error: 'Failed to save snippet.' }
  }
}

export async function updateSnippet(id: string, raw: unknown): Promise<Result<ClinicalNoteSnippet>> {
  const profile = await getOrCreateProfile()
  if (!profile || profile.role !== 'doctor') {
    return { success: false, error: 'Only doctors can edit clinical note snippets.' }
  }

  const parsed = snippetFormSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Please check the form and try again.' }
  }

  try {
    const supabase = createServerSupabaseClient()
    const { data, error } = await supabase
      .from('clinical_note_snippets')
      .update({
        title:      parsed.data.title,
        body:       parsed.data.body,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('doctor_id', profile.id)
      .select('*')
      .single()

    if (error) throw error
    if (!data) return { success: false, error: 'Snippet not found.' }

    revalidatePath('/dashboard/snippets')
    return { success: true, data: toSnippet(data) }
  } catch (err) {
    console.error('[updateSnippet]', err)
    return { success: false, error: 'Failed to update snippet.' }
  }
}

export async function deleteSnippet(id: string): Promise<Result<{ id: string }>> {
  const profile = await getOrCreateProfile()
  if (!profile || profile.role !== 'doctor') {
    return { success: false, error: 'Only doctors can delete clinical note snippets.' }
  }

  try {
    const supabase = createServerSupabaseClient()
    const { error } = await supabase
      .from('clinical_note_snippets')
      .delete()
      .eq('id', id)
      .eq('doctor_id', profile.id)

    if (error) throw error

    revalidatePath('/dashboard/snippets')
    return { success: true, data: { id } }
  } catch (err) {
    console.error('[deleteSnippet]', err)
    return { success: false, error: 'Failed to delete snippet.' }
  }
}