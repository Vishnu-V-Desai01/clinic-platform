// src/features/appointments/actions.ts
//
// All appointment operations live here. Every function:
//   1. Authorises the caller via requireRole
//   2. Validates input with Zod
//   3. Queries Supabase (RLS enforced at DB level)
//
// clinic_id always comes from the authenticated profile — never from the form.

"use server"

import { requireRole } from "@/lib/supabase/profile"
import { createServerSupabaseClient } from "@/lib/supabase/server"

import {
  cancelAppointmentSchema,
  createAppointmentSchema,
  rescheduleAppointmentSchema,
  updateAppointmentStatusSchema,
} from "./schema"
import type {
  CancelAppointmentData,
  CreateAppointmentData,
  RescheduleAppointmentData,
  UpdateAppointmentStatusData,
} from "./schema"
import {
  formatAppointmentDate,
  formatAppointmentTime,
  type AppointmentDetail,
  type AppointmentListItem,
  type AppointmentRecord,
  type AppointmentWithContext,
  type DoctorOption,
} from "./types"

/* -------------------------------------------------------------------------- */
/*  Result envelope                                                            */
/* -------------------------------------------------------------------------- */

type Result<T> =
  | { success: true; data: T }
  | { success: false; error: string }

/* -------------------------------------------------------------------------- */
/*  Internal query row types                                                   */
/*  These describe the shape Supabase returns for joined queries.             */
/* -------------------------------------------------------------------------- */

type PatientJoin = {
  first_name: string
  last_name: string
  patient_id_number: string | null
}

type ProfileJoin = {
  full_name: string
  specialization: string | null
}

type AppointmentListRow = {
  id: string
  appointment_date: string
  duration_minutes: number
  status: string
  chief_complaint: string | null
  patient_id: string
  doctor_id: string
  patients: PatientJoin | null
  profiles: ProfileJoin | null
}

type AppointmentDetailRow = AppointmentListRow & {
  clinic_id: string
  doctor_notes: string | null
  cancellation_reason: string | null
  created_at: string
  updated_at: string
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function combineDateAndTime(date: string, time: string): string {
  return `${date}T${time}:00+05:30`
}

function toListItem(row: AppointmentWithContext): AppointmentListItem {
  return {
    id:              row.id,
    patientName:     `${row.patient_first_name} ${row.patient_last_name}`,
    patientMrn:      row.patient_mrn,
    doctorName:      row.doctor_full_name,
    appointmentDate: formatAppointmentDate(row.appointment_date),
    appointmentTime: formatAppointmentTime(row.appointment_date),
    durationMinutes: row.duration_minutes,
    status:          row.status,
    chiefComplaint:  row.chief_complaint,
  }
}

function toDetail(row: AppointmentWithContext): AppointmentDetail {
  return {
    id:                  row.id,
    patientId:           row.patient_id,
    patientName:         `${row.patient_first_name} ${row.patient_last_name}`,
    patientMrn:          row.patient_mrn,
    doctorId:            row.doctor_id,
    doctorName:          row.doctor_full_name,
    doctorSpecialization: row.doctor_specialization,
    appointmentDate:     formatAppointmentDate(row.appointment_date),
    appointmentTime:     formatAppointmentTime(row.appointment_date),
    durationMinutes:     row.duration_minutes,
    status:              row.status,
    chiefComplaint:      row.chief_complaint,
    doctorNotes:         row.doctor_notes,
    cancellationReason:  row.cancellation_reason,
    createdAt:           row.created_at,
    updatedAt:           row.updated_at,
  }
}

/* -------------------------------------------------------------------------- */
/*  checkDoubleBooking                                                         */
/*  Fetches all the doctor's scheduled appointments for the same calendar     */
/*  day, then checks for true interval overlap in JS:                         */
/*    overlap = proposed_start < existing_end AND proposed_end > existing_start */
/*  This correctly catches e.g. a 60-min slot at 2 PM when booking at 2:30.  */
/* -------------------------------------------------------------------------- */

async function checkDoubleBooking(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  doctorId: string,
  appointmentDateISO: string,
  durationMinutes: number,
  excludeId?: string,
): Promise<boolean> {
  const proposedStart = new Date(appointmentDateISO)
  const proposedEnd   = new Date(proposedStart.getTime() + durationMinutes * 60_000)

  const dayStart = new Date(proposedStart)
  dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(proposedStart)
  dayEnd.setHours(23, 59, 59, 999)

  const { data, error } = await supabase
    .from("appointments")
    .select("id, appointment_date, duration_minutes")
    .eq("doctor_id", doctorId)
    .eq("status", "scheduled")
    .gte("appointment_date", dayStart.toISOString())
    .lte("appointment_date", dayEnd.toISOString())
    .is("deleted_at", null)

  if (error) {
    console.error("[checkDoubleBooking]", error)
    return false
  }

  for (const apt of data ?? []) {
    if (excludeId && apt.id === excludeId) continue

    const existingStart = new Date(apt.appointment_date)
    const existingEnd   = new Date(existingStart.getTime() + apt.duration_minutes * 60_000)

    if (proposedStart < existingEnd && proposedEnd > existingStart) {
      return true
    }
  }

  return false
}

/* -------------------------------------------------------------------------- */
/*  listDoctors                                                                */
/*  Returns all doctor profiles in the clinic for the booking form dropdown.  */
/* -------------------------------------------------------------------------- */

export async function listDoctors(): Promise<Result<DoctorOption[]>> {
  try {
    const profile  = await requireRole("doctor", "staff")
    const supabase = createServerSupabaseClient()

    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, specialization")
      .eq("clinic_id", profile.clinic_id)
      .eq("role", "doctor")
      .order("full_name")

    if (error) throw error

    const doctors: DoctorOption[] = (data ?? []).map((row) => ({
      id:             row.id,
      fullName:       row.full_name ?? "Unknown Doctor",
      specialization: (row as { specialization?: string | null }).specialization ?? null,
    }))

    return { success: true, data: doctors }
  } catch (err) {
    console.error("[listDoctors]", err)
    return { success: false, error: "Failed to load doctors." }
  }
}

/* -------------------------------------------------------------------------- */
/*  listAppointments                                                           */
/*  Returns all non-deleted appointments for the clinic, newest first.        */
/*  Optional filters narrow by patient, doctor, status, or date range.        */
/* -------------------------------------------------------------------------- */

export async function listAppointments(filters?: {
  patientId?: string
  doctorId?:  string
  status?:    string
  dateFrom?:  string   // "YYYY-MM-DD"
  dateTo?:    string   // "YYYY-MM-DD"
}): Promise<Result<AppointmentListItem[]>> {
  try {
    const profile  = await requireRole("doctor", "staff")
    const supabase = createServerSupabaseClient()

    let query = supabase
      .from("appointments")
      .select(`
        id,
        appointment_date,
        duration_minutes,
        status,
        chief_complaint,
        patient_id,
        doctor_id,
        patients ( first_name, last_name, patient_id_number ),
        profiles!appointments_doctor_id_fkey ( full_name, specialization )
      `)
      .eq("clinic_id", profile.clinic_id)
      .is("deleted_at", null)
      .order("appointment_date", { ascending: false })

    if (filters?.patientId) query = query.eq("patient_id", filters.patientId)
    if (filters?.doctorId)  query = query.eq("doctor_id",  filters.doctorId)
    if (filters?.status)    query = query.eq("status",     filters.status)
    if (filters?.dateFrom)  query = query.gte("appointment_date", `${filters.dateFrom}T00:00:00+05:30`)
    if (filters?.dateTo)    query = query.lte("appointment_date", `${filters.dateTo}T23:59:59+05:30`)

    const { data, error } = await query

    if (error) throw error

    const items = (data ?? []).map((row) => {
      const r = row as unknown as AppointmentListRow
      const ctx: AppointmentWithContext = {
        id:                   r.id,
        clinic_id:            profile.clinic_id,
        patient_id:           r.patient_id,
        patient_first_name:   r.patients?.first_name  ?? "—",
        patient_last_name:    r.patients?.last_name   ?? "—",
        patient_mrn:          r.patients?.patient_id_number ?? null,
        doctor_id:            r.doctor_id,
        doctor_full_name:     r.profiles?.full_name   ?? "—",
        doctor_specialization: r.profiles?.specialization ?? null,
        appointment_date:     r.appointment_date,
        duration_minutes:     r.duration_minutes,
        status:               r.status as AppointmentWithContext["status"],
        chief_complaint:      r.chief_complaint,
        doctor_notes:         null,
        cancellation_reason:  null,
        deleted_at:           null,
        created_at:           "",
        updated_at:           "",
      }
      return toListItem(ctx)
    })

    return { success: true, data: items }
  } catch (err) {
    console.error("[listAppointments]", err)
    return { success: false, error: "Failed to load appointments." }
  }
}

/* -------------------------------------------------------------------------- */
/*  getAppointmentById                                                         */
/*  Returns full details for one appointment.                                 */
/* -------------------------------------------------------------------------- */

export async function getAppointmentById(
  appointmentId: string,
): Promise<Result<AppointmentDetail>> {
  try {
    const profile  = await requireRole("doctor", "staff")
    const supabase = createServerSupabaseClient()

    const { data, error } = await supabase
      .from("appointments")
      .select(`
        id,
        clinic_id,
        patient_id,
        doctor_id,
        appointment_date,
        duration_minutes,
        status,
        chief_complaint,
        doctor_notes,
        cancellation_reason,
        created_at,
        updated_at,
        patients ( first_name, last_name, patient_id_number ),
        profiles!appointments_doctor_id_fkey ( full_name, specialization )
      `)
      .eq("id", appointmentId)
      .eq("clinic_id", profile.clinic_id)
      .is("deleted_at", null)
      .single()

    if (error) throw error
    if (!data)  return { success: false, error: "Appointment not found." }

    const r = data as unknown as AppointmentDetailRow
    const ctx: AppointmentWithContext = {
      id:                   r.id,
      clinic_id:            r.clinic_id,
      patient_id:           r.patient_id,
      patient_first_name:   r.patients?.first_name  ?? "—",
      patient_last_name:    r.patients?.last_name   ?? "—",
      patient_mrn:          r.patients?.patient_id_number ?? null,
      doctor_id:            r.doctor_id,
      doctor_full_name:     r.profiles?.full_name   ?? "—",
      doctor_specialization: r.profiles?.specialization ?? null,
      appointment_date:     r.appointment_date,
      duration_minutes:     r.duration_minutes,
      status:               r.status as AppointmentWithContext["status"],
      chief_complaint:      r.chief_complaint,
      doctor_notes:         r.doctor_notes,
      cancellation_reason:  r.cancellation_reason,
      deleted_at:           null,
      created_at:           r.created_at,
      updated_at:           r.updated_at,
    }

    return { success: true, data: toDetail(ctx) }
  } catch (err) {
    console.error("[getAppointmentById]", err)
    return { success: false, error: "Failed to load appointment." }
  }
}

/* -------------------------------------------------------------------------- */
/*  createAppointment                                                          */
/* -------------------------------------------------------------------------- */

export async function createAppointment(
  input: Record<string, unknown>,
): Promise<Result<AppointmentRecord>> {
  try {
    const profile = await requireRole("doctor", "staff")

    const parsed = createAppointmentSchema.safeParse(input)
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? "Please check the form and try again."
      return { success: false, error: message }
    }

    const data: CreateAppointmentData = parsed.data
    const supabase  = createServerSupabaseClient()
    const isoDateTime = combineDateAndTime(data.appointmentDate, data.appointmentTime)

    const hasConflict = await checkDoubleBooking(
      supabase, data.doctorId, isoDateTime, data.durationMinutes,
    )
    if (hasConflict) {
      return { success: false, error: "That doctor already has an appointment at this time." }
    }

    const { data: created, error } = await supabase
      .from("appointments")
      .insert({
        clinic_id:        profile.clinic_id,
        patient_id:       data.patientId,
        doctor_id:        data.doctorId,
        appointment_date: isoDateTime,
        duration_minutes: data.durationMinutes,
        status:           "scheduled",
        chief_complaint:  data.chiefComplaint,
      })
      .select()
      .single()

    if (error) throw error

    return { success: true, data: created as AppointmentRecord }
  } catch (err) {
    console.error("[createAppointment]", err)
    return { success: false, error: "Failed to create appointment." }
  }
}

/* -------------------------------------------------------------------------- */
/*  rescheduleAppointment                                                      */
/* -------------------------------------------------------------------------- */

export async function rescheduleAppointment(
  appointmentId: string,
  input: Record<string, unknown>,
): Promise<Result<AppointmentRecord>> {
  try {
    const profile = await requireRole("doctor", "staff")

    const parsed = rescheduleAppointmentSchema.safeParse(input)
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? "Please check the form and try again."
      return { success: false, error: message }
    }

    const data: RescheduleAppointmentData = parsed.data
    const supabase = createServerSupabaseClient()

    const { data: existing, error: fetchError } = await supabase
      .from("appointments")
      .select("doctor_id, status")
      .eq("id", appointmentId)
      .eq("clinic_id", profile.clinic_id)
      .is("deleted_at", null)
      .single()

    if (fetchError || !existing) return { success: false, error: "Appointment not found." }

    if (existing.status !== "scheduled") {
      return { success: false, error: "Only scheduled appointments can be rescheduled." }
    }

    const isoDateTime = combineDateAndTime(data.appointmentDate, data.appointmentTime)

    const hasConflict = await checkDoubleBooking(
      supabase, existing.doctor_id, isoDateTime, data.durationMinutes, appointmentId,
    )
    if (hasConflict) {
      return { success: false, error: "That doctor already has an appointment at this time." }
    }

    const { data: updated, error } = await supabase
      .from("appointments")
      .update({
        appointment_date: isoDateTime,
        duration_minutes: data.durationMinutes,
        updated_at:       new Date().toISOString(),
      })
      .eq("id", appointmentId)
      .eq("clinic_id", profile.clinic_id)
      .select()
      .single()

    if (error) throw error

    return { success: true, data: updated as AppointmentRecord }
  } catch (err) {
    console.error("[rescheduleAppointment]", err)
    return { success: false, error: "Failed to reschedule appointment." }
  }
}

/* -------------------------------------------------------------------------- */
/*  cancelAppointment                                                          */
/*  Sets status → "cancelled". Does NOT set deleted_at — cancelled            */
/*  appointments must remain visible in history.                              */
/* -------------------------------------------------------------------------- */

export async function cancelAppointment(
  appointmentId: string,
  input?: Record<string, unknown>,
): Promise<Result<void>> {
  try {
    const profile = await requireRole("doctor", "staff")

    let cancelData: CancelAppointmentData | undefined
    if (input) {
      const parsed = cancelAppointmentSchema.safeParse(input)
      if (!parsed.success) {
        const message = parsed.error.issues[0]?.message ?? "Please check the form and try again."
        return { success: false, error: message }
      }
      cancelData = parsed.data
    }

    const supabase = createServerSupabaseClient()

    const { data: existing, error: fetchError } = await supabase
      .from("appointments")
      .select("status")
      .eq("id", appointmentId)
      .eq("clinic_id", profile.clinic_id)
      .is("deleted_at", null)
      .single()

    if (fetchError || !existing) return { success: false, error: "Appointment not found." }

    if (existing.status === "cancelled") {
      return { success: false, error: "This appointment is already cancelled." }
    }
    if (existing.status === "completed") {
      return { success: false, error: "Completed appointments cannot be cancelled." }
    }

    const { error } = await supabase
      .from("appointments")
      .update({
        status:              "cancelled",
        cancellation_reason: cancelData?.reason ?? null,
        updated_at:          new Date().toISOString(),
      })
      .eq("id", appointmentId)
      .eq("clinic_id", profile.clinic_id)

    if (error) throw error

    return { success: true, data: undefined }
  } catch (err) {
    console.error("[cancelAppointment]", err)
    return { success: false, error: "Failed to cancel appointment." }
  }
}

/* -------------------------------------------------------------------------- */
/*  updateAppointmentStatus                                                    */
/*  Doctor-only: mark completed or no_show, optionally add clinical notes.    */
/* -------------------------------------------------------------------------- */

export async function updateAppointmentStatus(
  appointmentId: string,
  input: Record<string, unknown>,
): Promise<Result<AppointmentRecord>> {
  try {
    const profile = await requireRole("doctor")

    const parsed = updateAppointmentStatusSchema.safeParse(input)
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? "Please check the form and try again."
      return { success: false, error: message }
    }

    const data: UpdateAppointmentStatusData = parsed.data
    const supabase = createServerSupabaseClient()

    const { data: existing, error: fetchError } = await supabase
      .from("appointments")
      .select("status")
      .eq("id", appointmentId)
      .eq("clinic_id", profile.clinic_id)
      .is("deleted_at", null)
      .single()

    if (fetchError || !existing) return { success: false, error: "Appointment not found." }

    if (existing.status === "cancelled") {
      return { success: false, error: "Cancelled appointments cannot be updated." }
    }

    const { data: updated, error } = await supabase
      .from("appointments")
      .update({
        status:       data.status,
        doctor_notes: data.doctorNotes ?? null,
        updated_at:   new Date().toISOString(),
      })
      .eq("id", appointmentId)
      .eq("clinic_id", profile.clinic_id)
      .select()
      .single()

    if (error) throw error

    return { success: true, data: updated as AppointmentRecord }
  } catch (err) {
    console.error("[updateAppointmentStatus]", err)
    return { success: false, error: "Failed to update appointment." }
  }
}