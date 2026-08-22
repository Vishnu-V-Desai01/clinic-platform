'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/supabase/profile'
import {
  submitAppointmentRequestSchema,
  cancelAppointmentRequestSchema,
  respondToAppointmentRequestSchema,
} from './schema'
import type {
  MyAppointmentRequest,
  ClinicAppointmentRequest,
  FamilyCardWithDoctor,
} from './types'

type ListMyRequestsResult = { success: true; data: MyAppointmentRequest[] } | { success: false; error: string }
type SubmitRequestResult  = { success: true; data: null } | { success: false; error: string }
type CancelRequestResult  = { success: true; data: null } | { success: false; error: string }
type ListClinicResult     = { success: true; data: ClinicAppointmentRequest[] } | { success: false; error: string }
type RespondResult        = { success: true; data: null } | { success: false; error: string }
type ListCardsWithDoctorResult = { success: true; data: FamilyCardWithDoctor[] } | { success: false; error: string }

// ─── PATIENT-SIDE ─────────────────────────────────────────────────────────────

export async function listMyAppointmentRequests(): Promise<ListMyRequestsResult> {
  await requireRole('patient')
  const supabase = createServerSupabaseClient()

  const { data, error } = await supabase.rpc('list_my_appointment_requests')
  if (error) return { success: false, error: error.message }

  type RpcRow = {
    id: string
    patient_id: string
    clinic_id: string
    patient_first_name: string
    patient_last_name: string
    clinic_name: string
    preferred_date: string
    preferred_time_slot: string | null
    reason: string | null
    status: string
    response_note: string | null
    confirmed_appointment_id: string | null
    responded_at: string | null
    created_at: string
    updated_at: string
  }

  const rows = (data ?? []) as RpcRow[]
  return {
    success: true,
    data: rows.map((r) => ({
      id: r.id,
      patientId: r.patient_id,
      clinicId: r.clinic_id,
      patientFirstName: r.patient_first_name,
      patientLastName: r.patient_last_name,
      clinicName: r.clinic_name,
      preferredDate: r.preferred_date,
      preferredTimeSlot: r.preferred_time_slot as MyAppointmentRequest['preferredTimeSlot'],
      reason: r.reason,
      status: r.status as MyAppointmentRequest['status'],
      responseNote: r.response_note,
      confirmedAppointmentId: r.confirmed_appointment_id,
      respondedAt: r.responded_at,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })),
  }
}

// Same family cards as listMyFamilyPatientCards() (access-grants
// feature), enriched with the assigned doctor's name — built for the
// appointment-request dropdown specifically. Kept separate from that
// function so Home / Card Detail / Consents aren't touched here.
export async function listMyFamilyCardsWithDoctor(): Promise<ListCardsWithDoctorResult> {
  await requireRole('patient')
  const supabase = createServerSupabaseClient()

  const { data, error } = await supabase.rpc('list_my_family_cards_with_doctor')
  if (error) return { success: false, error: error.message }

  type RpcRow = {
    id: string
    first_name: string
    last_name: string
    clinic_name: string
    doctor_name: string | null
  }

  const rows = (data ?? []) as RpcRow[]
  return {
    success: true,
    data: rows.map((r) => ({
      id: r.id,
      firstName: r.first_name,
      lastName: r.last_name,
      clinicName: r.clinic_name,
      doctorName: r.doctor_name,
    })),
  }
}

export async function submitAppointmentRequest(raw: unknown): Promise<SubmitRequestResult> {
  await requireRole('patient')

  const parsed = submitAppointmentRequestSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  const { patientId, preferredDate, preferredTimeSlot, reason } = parsed.data
  const supabase = createServerSupabaseClient()

  const { data: patientRow, error: pErr } = await supabase
    .from('patients')
    .select('clinic_id, family_account_id')
    .eq('id', patientId)
    .is('deleted_at', null)
    .maybeSingle()

  if (pErr) return { success: false, error: pErr.message }
  if (!patientRow) return { success: false, error: 'Patient card not found or does not belong to your account.' }

  const { error: insertError } = await supabase
    .from('appointment_requests')
    .insert({
      family_account_id: patientRow.family_account_id,
      patient_id: patientId,
      clinic_id: patientRow.clinic_id,
      preferred_date: preferredDate,
      preferred_time_slot: preferredTimeSlot ?? null,
      reason: reason ?? null,
    })

  if (insertError) return { success: false, error: insertError.message }

  revalidatePath('/portal/request')
  return { success: true, data: null }
}

export async function cancelAppointmentRequest(raw: unknown): Promise<CancelRequestResult> {
  await requireRole('patient')

  const parsed = cancelAppointmentRequestSchema.safeParse(raw)
  if (!parsed.success) return { success: false, error: 'Invalid request ID' }

  const supabase = createServerSupabaseClient()

  const { data, error } = await supabase
    .from('appointment_requests')
    .update({ status: 'cancelled' })
    .eq('id', parsed.data.requestId)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle()

  if (error) return { success: false, error: error.message }
  if (!data) return { success: false, error: 'Request not found, already responded to, or not yours to cancel.' }

  revalidatePath('/portal/request')
  return { success: true, data: null }
}

// ─── CLINIC-SIDE (staff / doctor) — used in Chat 22 ──────────────────────────

export async function listClinicAppointmentRequests(): Promise<ListClinicResult> {
  const profile = await requireRole('doctor', 'staff')
  const supabase = createServerSupabaseClient()

  const { data, error } = await supabase
    .from('appointment_requests')
    .select(`
      id, patient_id, preferred_date, preferred_time_slot, reason,
      status, response_note, responded_at, created_at, updated_at,
      patient:patients!inner(first_name, last_name, patient_id_number)
    `)
    .eq('clinic_id', profile.clinic_id)
    .order('created_at', { ascending: false })

  if (error) return { success: false, error: error.message }

  type Row = {
    id: string
    patient_id: string
    preferred_date: string
    preferred_time_slot: string | null
    reason: string | null
    status: string
    response_note: string | null
    responded_at: string | null
    created_at: string
    updated_at: string
    patient: { first_name: string; last_name: string; patient_id_number: string | null } | null
  }

  return {
    success: true,
    data: ((data as unknown) as Row[] ?? []).map((r) => ({
      id: r.id,
      patientId: r.patient_id,
      preferredDate: r.preferred_date,
      preferredTimeSlot: r.preferred_time_slot as ClinicAppointmentRequest['preferredTimeSlot'],
      reason: r.reason,
      status: r.status as ClinicAppointmentRequest['status'],
      responseNote: r.response_note,
      respondedAt: r.responded_at,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      patient: r.patient
        ? { firstName: r.patient.first_name, lastName: r.patient.last_name, mrn: r.patient.patient_id_number }
        : null,
    })),
  }
}

export async function respondToAppointmentRequest(raw: unknown): Promise<RespondResult> {
  const profile = await requireRole('doctor', 'staff')

  const parsed = respondToAppointmentRequestSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  const { requestId, status, responseNote, confirmedAppointmentId } = parsed.data

  if (status === 'confirmed' && !confirmedAppointmentId) {
    return { success: false, error: 'confirmed_appointment_id is required when confirming a request.' }
  }

  const supabase = createServerSupabaseClient()

  const { data, error } = await supabase
    .from('appointment_requests')
    .update({
      status,
      response_note: responseNote ?? null,
      confirmed_appointment_id: confirmedAppointmentId ?? null,
      responded_by: profile.id,
      responded_at: new Date().toISOString(),
    })
    .eq('id', requestId)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle()

  if (error) return { success: false, error: error.message }
  if (!data) return { success: false, error: 'Request not found or already responded to.' }

  revalidatePath('/dashboard/appointments')
  return { success: true, data: null }
}