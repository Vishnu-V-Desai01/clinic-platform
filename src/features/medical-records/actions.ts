//src/features/medical-records/actions.ts
'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getOrCreateProfile } from '@/lib/supabase/profile'
import {
  newEncounterSchema,
  addDiagnosisSchema,
  addObservationSchema,
  addPrescriptionSchema,
  addTestResultSchema,
  updateEncounterStatusSchema,
  updateDiagnosisStatusSchema,
  updatePrescriptionStatusSchema,
  updateTestResultSchema,
} from './schema'
import type {
  Encounter,
  EncounterWithDetails,
  Diagnosis,
  Observation,
  Prescription,
  TestResult,
} from './types'

// ---------------------------------------------------------------
// READ — all encounters for a patient (newest first)
// Doctor + staff
// FIX (this chat): now restricted to doctor/staff, matching every
// other feature's read functions - previously any authenticated role
// (including 'patient') could call this.
// ---------------------------------------------------------------
export async function getEncountersForPatient(
  patientId: string
): Promise<{ data: Encounter[] } | { error: string }> {
  try {
    const profile = await getOrCreateProfile()
    if (!profile) return { error: 'Unauthorized' }
    if (!['doctor', 'staff'].includes(profile.role)) return { error: 'Unauthorized' }

    const supabase = await createServerSupabaseClient()

    const { data, error } = await supabase
      .from('encounters')
      .select('*')
      .eq('patient_id', patientId)
      .order('encounter_date', { ascending: false })

    if (error) return { error: error.message }
    return { data: data ?? [] }
  } catch {
    return { error: 'Failed to load encounters' }
  }
}

// ---------------------------------------------------------------
// READ — single encounter with all children
// Doctor + staff
// FIX (this chat): now restricted to doctor/staff (previously any
// authenticated role). Also, a failed child-table query (diagnoses/
// observations/prescriptions/test_results) is now surfaced via an
// optional `warnings` array instead of being silently treated as
// "this encounter has none" - the encounter and any children that DID
// load are still returned, since failing the whole request over one
// flaky child query would lose strictly more information than it saves.
// ---------------------------------------------------------------
export async function getEncounterWithDetails(
  encounterId: string
): Promise<{ data: EncounterWithDetails; warnings?: string[] } | { error: string }> {
  try {
    const profile = await getOrCreateProfile()
    if (!profile) return { error: 'Unauthorized' }
    if (!['doctor', 'staff'].includes(profile.role)) return { error: 'Unauthorized' }

    const supabase = await createServerSupabaseClient()

    const [encounterRes, diagnosesRes, observationsRes, prescriptionsRes, testResultsRes] =
      await Promise.all([
        supabase.from('encounters').select('*').eq('id', encounterId).single(),
        supabase.from('diagnoses').select('*').eq('encounter_id', encounterId).order('created_at'),
        supabase.from('observations').select('*').eq('encounter_id', encounterId).order('created_at'),
        supabase.from('prescriptions').select('*').eq('encounter_id', encounterId).order('created_at'),
        supabase.from('test_results').select('*').eq('encounter_id', encounterId).order('created_at'),
      ])

    if (encounterRes.error) return { error: encounterRes.error.message }
    if (!encounterRes.data)  return { error: 'Encounter not found' }

    const warnings: string[] = []
    if (diagnosesRes.error) {
      console.error('Diagnoses fetch error:', diagnosesRes.error.message)
      warnings.push('Some diagnoses could not be loaded.')
    }
    if (observationsRes.error) {
      console.error('Observations fetch error:', observationsRes.error.message)
      warnings.push('Some observations could not be loaded.')
    }
    if (prescriptionsRes.error) {
      console.error('Prescriptions fetch error:', prescriptionsRes.error.message)
      warnings.push('Some prescriptions could not be loaded.')
    }
    if (testResultsRes.error) {
      console.error('Test results fetch error:', testResultsRes.error.message)
      warnings.push('Some test results could not be loaded.')
    }

    const data: EncounterWithDetails = {
      ...encounterRes.data,
      diagnoses:     diagnosesRes.data    ?? [],
      observations:  observationsRes.data  ?? [],
      prescriptions: prescriptionsRes.data ?? [],
      test_results:  testResultsRes.data   ?? [],
    }

    return warnings.length > 0 ? { data, warnings } : { data }
  } catch {
    return { error: 'Failed to load encounter details' }
  }
}

// ---------------------------------------------------------------
// CREATE — new encounter + all children atomically
// Encounter is inserted first. Children are bulk-inserted after.
// If a child batch fails it is logged but the encounter is still
// returned — doctor can add missing items individually.
// Doctor only
// FIX (this chat): a failed child batch is now also surfaced via an
// optional `warnings` array on the success response, in addition to
// the existing console.error. Previously the caller had no way to
// know anything was dropped - success:true looked identical whether
// everything saved or some batches silently failed.
// ---------------------------------------------------------------
export async function createEncounter(
  patientId: string,
  rawData: unknown
): Promise<
  | { success: true; encounterId: string; warnings?: string[] }
  | { error: string }
> {
  try {
    const profile = await getOrCreateProfile()
    if (!profile) return { error: 'Unauthorized' }
    if (profile.role !== 'doctor') return { error: 'Only doctors can create encounters' }

    const parsed = newEncounterSchema.safeParse(rawData)
    if (!parsed.success) return { error: parsed.error.issues[0].message }

    const { encounter_date, chief_complaint, notes, diagnoses, observations, prescriptions } =
      parsed.data

    const supabase = await createServerSupabaseClient()

    // 1. Insert encounter
    const { data: encounter, error: encounterError } = await supabase
      .from('encounters')
      .insert({
        clinic_id:       profile.clinic_id,
        patient_id:      patientId,
        doctor_id:       profile.id,
        encounter_date,
        chief_complaint: chief_complaint ?? null,
        notes:           notes ?? null,
        status:          'active',
      })
      .select('id')
      .single()

    if (encounterError) return { error: encounterError.message }
    if (!encounter)     return { error: 'Failed to create encounter' }

    const encounterId = encounter.id
    const warnings: string[] = []

    // 2. Bulk-insert diagnoses
    if (diagnoses.length > 0) {
      const { error } = await supabase.from('diagnoses').insert(
        diagnoses.map((d) => ({
          clinic_id:      profile.clinic_id,
          encounter_id:   encounterId,
          patient_id:     patientId,
          condition_name: d.condition_name,
          code:           d.code        ?? null,
          code_system:    d.code_system ?? null,
          severity:       d.severity    ?? null,
          status:         d.status,
          notes:          d.notes       ?? null,
        }))
      )
      if (error) {
        console.error('Diagnoses insert error:', error.message)
        warnings.push('Some diagnoses could not be saved.')
      }
    }

    // 3. Bulk-insert observations
    if (observations.length > 0) {
      const { error } = await supabase.from('observations').insert(
        observations.map((o) => ({
          clinic_id:        profile.clinic_id,
          encounter_id:     encounterId,
          patient_id:       patientId,
          observation_type: o.observation_type,
          value:            o.value,
          unit:             o.unit        ?? null,
          code:             o.code        ?? null,
          code_system:      o.code_system ?? null,
          notes:            o.notes       ?? null,
        }))
      )
      if (error) {
        console.error('Observations insert error:', error.message)
        warnings.push('Some observations could not be saved.')
      }
    }

    // 4. Bulk-insert prescriptions
    if (prescriptions.length > 0) {
      const { error } = await supabase.from('prescriptions').insert(
        prescriptions.map((p) => ({
          clinic_id:     profile.clinic_id,
          encounter_id:  encounterId,
          patient_id:    patientId,
          medicine_name: p.medicine_name,
          dosage:        p.dosage        ?? null,
          frequency:     p.frequency     ?? null,
          duration:      p.duration      ?? null,
          instructions:  p.instructions  ?? null,
          status:        p.status,
        }))
      )
      if (error) {
        console.error('Prescriptions insert error:', error.message)
        warnings.push('Some prescriptions could not be saved.')
      }
    }

    return warnings.length > 0
      ? { success: true, encounterId, warnings }
      : { success: true, encounterId }
  } catch {
    return { error: 'Failed to create encounter' }
  }
}

// ---------------------------------------------------------------
// UPDATE — encounter status
// Doctor only
// ---------------------------------------------------------------
export async function updateEncounterStatus(
  encounterId: string,
  rawData: unknown
): Promise<{ success: true } | { error: string }> {
  try {
    const profile = await getOrCreateProfile()
    if (!profile) return { error: 'Unauthorized' }
    if (profile.role !== 'doctor') return { error: 'Only doctors can update encounters' }

    const parsed = updateEncounterStatusSchema.safeParse(rawData)
    if (!parsed.success) return { error: parsed.error.issues[0].message }

    const supabase = await createServerSupabaseClient()

    const { error } = await supabase
      .from('encounters')
      .update({ status: parsed.data.status })
      .eq('id', encounterId)
      .eq('clinic_id', profile.clinic_id)

    if (error) return { error: error.message }
    return { success: true }
  } catch {
    return { error: 'Failed to update encounter status' }
  }
}

// ---------------------------------------------------------------
// ADD — single diagnosis to an existing encounter
// Doctor only
// ---------------------------------------------------------------
export async function addDiagnosis(
  encounterId: string,
  patientId: string,
  rawData: unknown
): Promise<{ success: true; data: Diagnosis } | { error: string }> {
  try {
    const profile = await getOrCreateProfile()
    if (!profile) return { error: 'Unauthorized' }
    if (profile.role !== 'doctor') return { error: 'Only doctors can add diagnoses' }

    const parsed = addDiagnosisSchema.safeParse(rawData)
    if (!parsed.success) return { error: parsed.error.issues[0].message }

    const supabase = await createServerSupabaseClient()

    const { data, error } = await supabase
      .from('diagnoses')
      .insert({
        clinic_id:      profile.clinic_id,
        encounter_id:   encounterId,
        patient_id:     patientId,
        condition_name: parsed.data.condition_name,
        code:           parsed.data.code        ?? null,
        code_system:    parsed.data.code_system ?? null,
        severity:       parsed.data.severity    ?? null,
        status:         parsed.data.status,
        notes:          parsed.data.notes       ?? null,
      })
      .select()
      .single()

    if (error) return { error: error.message }
    return { success: true, data }
  } catch {
    return { error: 'Failed to add diagnosis' }
  }
}

// ---------------------------------------------------------------
// ADD — single observation to an existing encounter
// Doctor only
// ---------------------------------------------------------------
export async function addObservation(
  encounterId: string,
  patientId: string,
  rawData: unknown
): Promise<{ success: true; data: Observation } | { error: string }> {
  try {
    const profile = await getOrCreateProfile()
    if (!profile) return { error: 'Unauthorized' }
    if (profile.role !== 'doctor') return { error: 'Only doctors can add observations' }

    const parsed = addObservationSchema.safeParse(rawData)
    if (!parsed.success) return { error: parsed.error.issues[0].message }

    const supabase = await createServerSupabaseClient()

    const { data, error } = await supabase
      .from('observations')
      .insert({
        clinic_id:        profile.clinic_id,
        encounter_id:     encounterId,
        patient_id:       patientId,
        observation_type: parsed.data.observation_type,
        value:            parsed.data.value,
        unit:             parsed.data.unit        ?? null,
        code:             parsed.data.code        ?? null,
        code_system:      parsed.data.code_system ?? null,
        notes:            parsed.data.notes       ?? null,
      })
      .select()
      .single()

    if (error) return { error: error.message }
    return { success: true, data }
  } catch {
    return { error: 'Failed to add observation' }
  }
}

// ---------------------------------------------------------------
// ADD — single prescription to an existing encounter
// Doctor only
// ---------------------------------------------------------------
export async function addPrescription(
  encounterId: string,
  patientId: string,
  rawData: unknown
): Promise<{ success: true; data: Prescription } | { error: string }> {
  try {
    const profile = await getOrCreateProfile()
    if (!profile) return { error: 'Unauthorized' }
    if (profile.role !== 'doctor') return { error: 'Only doctors can add prescriptions' }

    const parsed = addPrescriptionSchema.safeParse(rawData)
    if (!parsed.success) return { error: parsed.error.issues[0].message }

    const supabase = await createServerSupabaseClient()

    const { data, error } = await supabase
      .from('prescriptions')
      .insert({
        clinic_id:     profile.clinic_id,
        encounter_id:  encounterId,
        patient_id:    patientId,
        medicine_name: parsed.data.medicine_name,
        dosage:        parsed.data.dosage        ?? null,
        frequency:     parsed.data.frequency     ?? null,
        duration:      parsed.data.duration      ?? null,
        instructions:  parsed.data.instructions  ?? null,
        status:        parsed.data.status,
      })
      .select()
      .single()

    if (error) return { error: error.message }
    return { success: true, data }
  } catch {
    return { error: 'Failed to add prescription' }
  }
}

// ---------------------------------------------------------------
// ADD — test result
// Doctor or staff (staff adds results when lab sends them back)
// ---------------------------------------------------------------
export async function addTestResult(
  encounterId: string,
  patientId: string,
  rawData: unknown
): Promise<{ success: true; data: TestResult } | { error: string }> {
  try {
    const profile = await getOrCreateProfile()
    if (!profile) return { error: 'Unauthorized' }
    if (!['doctor', 'staff'].includes(profile.role)) return { error: 'Unauthorized' }

    const parsed = addTestResultSchema.safeParse(rawData)
    if (!parsed.success) return { error: parsed.error.issues[0].message }

    const supabase = await createServerSupabaseClient()

    const { data, error } = await supabase
      .from('test_results')
      .insert({
        clinic_id:       profile.clinic_id,
        encounter_id:    encounterId,
        patient_id:      patientId,
        test_name:       parsed.data.test_name,
        result_value:    parsed.data.result_value    ?? null,
        result_text:     parsed.data.result_text     ?? null,
        reference_range: parsed.data.reference_range ?? null,
        is_abnormal:     parsed.data.is_abnormal,
        status:          parsed.data.status,
        code:            parsed.data.code            ?? null,
        code_system:     parsed.data.code_system     ?? null,
        notes:           parsed.data.notes           ?? null,
      })
      .select()
      .single()

    if (error) return { error: error.message }
    return { success: true, data }
  } catch {
    return { error: 'Failed to add test result' }
  }
}

// ---------------------------------------------------------------
// UPDATE — diagnosis status (e.g. active → resolved)
// Doctor only
// ---------------------------------------------------------------
export async function updateDiagnosisStatus(
  diagnosisId: string,
  rawData: unknown
): Promise<{ success: true } | { error: string }> {
  try {
    const profile = await getOrCreateProfile()
    if (!profile) return { error: 'Unauthorized' }
    if (profile.role !== 'doctor') return { error: 'Only doctors can update diagnoses' }

    const parsed = updateDiagnosisStatusSchema.safeParse(rawData)
    if (!parsed.success) return { error: parsed.error.issues[0].message }

    const supabase = await createServerSupabaseClient()

    const { error } = await supabase
      .from('diagnoses')
      .update({ status: parsed.data.status })
      .eq('id', diagnosisId)
      .eq('clinic_id', profile.clinic_id)

    if (error) return { error: error.message }
    return { success: true }
  } catch {
    return { error: 'Failed to update diagnosis status' }
  }
}

// ---------------------------------------------------------------
// UPDATE — prescription status (e.g. active → stopped)
// Doctor only
// ---------------------------------------------------------------
export async function updatePrescriptionStatus(
  prescriptionId: string,
  rawData: unknown
): Promise<{ success: true } | { error: string }> {
  try {
    const profile = await getOrCreateProfile()
    if (!profile) return { error: 'Unauthorized' }
    if (profile.role !== 'doctor') return { error: 'Only doctors can update prescriptions' }

    const parsed = updatePrescriptionStatusSchema.safeParse(rawData)
    if (!parsed.success) return { error: parsed.error.issues[0].message }

    const supabase = await createServerSupabaseClient()

    const { error } = await supabase
      .from('prescriptions')
      .update({ status: parsed.data.status })
      .eq('id', prescriptionId)
      .eq('clinic_id', profile.clinic_id)

    if (error) return { error: error.message }
    return { success: true }
  } catch {
    return { error: 'Failed to update prescription status' }
  }
}

// ---------------------------------------------------------------
// UPDATE — test result (fill in values when lab results arrive)
// Doctor or staff
// ---------------------------------------------------------------
export async function updateTestResult(
  testResultId: string,
  rawData: unknown
): Promise<{ success: true } | { error: string }> {
  try {
    const profile = await getOrCreateProfile()
    if (!profile) return { error: 'Unauthorized' }
    if (!['doctor', 'staff'].includes(profile.role)) return { error: 'Unauthorized' }

    const parsed = updateTestResultSchema.safeParse(rawData)
    if (!parsed.success) return { error: parsed.error.issues[0].message }

    const supabase = await createServerSupabaseClient()

    const { error } = await supabase
      .from('test_results')
      .update({
        status:          parsed.data.status,
        result_value:    parsed.data.result_value    ?? null,
        result_text:     parsed.data.result_text     ?? null,
        reference_range: parsed.data.reference_range ?? null,
        is_abnormal:     parsed.data.is_abnormal     ?? false,
        notes:           parsed.data.notes           ?? null,
      })
      .eq('id', testResultId)
      .eq('clinic_id', profile.clinic_id)

    if (error) return { error: error.message }
    return { success: true }
  } catch {
    return { error: 'Failed to update test result' }
  }
}