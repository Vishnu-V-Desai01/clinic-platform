// src/features/appointments/types.ts
//
// All appointment-related types live here — one source of truth.
// Convention: data is always in DATABASE form (status "scheduled", times in ISO 8601).
// Friendly labels ("Scheduled", "2:30 PM") are applied only when rendering.
//
// Chat 19: added doctorId to AppointmentListItem so the client can gate
// "Mark as Complete" to the logged-in doctor's own appointments without
// an extra server round-trip. Ownership is re-verified server-side in
// getVisitPrefill before any data is loaded.

/* ----------------------------- Value types ------------------------------ */

export type AppointmentStatus = "scheduled" | "completed" | "cancelled" | "no_show"

/* ------------------------- Database row (snake_case) --------------------- */

export interface AppointmentRecord {
  id: string
  clinic_id: string
  patient_id: string
  doctor_id: string
  appointment_date: string
  duration_minutes: number
  status: AppointmentStatus
  chief_complaint: string | null
  doctor_notes: string | null
  cancellation_reason: string | null
  deleted_at: string | null
  created_at: string
  updated_at: string
}

/* ----------------------- Joined row (with names) ------------------------ */

export interface AppointmentWithContext extends AppointmentRecord {
  patient_first_name: string
  patient_last_name: string
  patient_mrn: string | null
  doctor_full_name: string
  doctor_specialization: string | null
}

/* --------------------------- Form values (camelCase) --------------------- */

export interface AppointmentFormValues {
  patientId: string
  doctorId: string
  appointmentDate: string
  appointmentTime: string
  durationMinutes: number
  chiefComplaint: string
}

/* ------------------------- List row (display shape) ---------------------- */

export interface AppointmentListItem {
  id:              string
  doctorId:        string        // ← Chat 19: added for Mark as Complete gate
  patientName:     string
  patientMrn:      string | null
  doctorName:      string
  appointmentDate: string
  appointmentTime: string
  durationMinutes: number
  status:          AppointmentStatus
  chiefComplaint:  string | null
}

/* -------------------- Detail view (display shape) ----------------------- */

export interface AppointmentDetail {
  id: string
  patientId: string
  patientName: string
  patientMrn: string | null
  doctorId: string
  doctorName: string
  doctorSpecialization: string | null
  appointmentDate: string
  appointmentTime: string
  durationMinutes: number
  status: AppointmentStatus
  chiefComplaint: string | null
  doctorNotes: string | null
  cancellationReason: string | null
  createdAt: string
  updatedAt: string
}

/* -------------------- Doctor option (for booking form) ------------------ */

export interface DoctorOption {
  id: string
  fullName: string
  specialization: string | null
}

/* ----------------------------- Dropdown options -------------------------- */

export const STATUS_OPTIONS: ReadonlyArray<{
  value: AppointmentStatus
  label: string
}> = [
  { value: "scheduled", label: "Scheduled" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "no_show",   label: "No Show"   },
]

export const DURATION_OPTIONS: ReadonlyArray<{
  value: number
  label: string
}> = [
  { value: 15,  label: "15 min"    },
  { value: 30,  label: "30 min"    },
  { value: 45,  label: "45 min"    },
  { value: 60,  label: "1 hour"    },
  { value: 90,  label: "1.5 hours" },
  { value: 120, label: "2 hours"   },
]

/* ------------------------------- Helpers --------------------------------- */

export function statusLabel(value: AppointmentStatus): string {
  return STATUS_OPTIONS.find((o) => o.value === value)?.label ?? value
}

export function durationLabel(minutes: number): string {
  return DURATION_OPTIONS.find((o) => o.value === minutes)?.label ?? `${minutes} min`
}

export function formatAppointmentDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-CA", {
      timeZone: "Asia/Kolkata",
      year:     "numeric",
      month:    "2-digit",
      day:      "2-digit",
    })
  } catch {
    return "—"
  }
}

export function formatAppointmentTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("en-IN", {
      timeZone: "Asia/Kolkata",
      hour:     "2-digit",
      minute:   "2-digit",
      hour12:   false,
    })
  } catch {
    return "—"
  }
}

export function formatAppointmentDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      day:      "numeric",
      month:    "short",
      year:     "numeric",
      hour:     "2-digit",
      minute:   "2-digit",
      hour12:   true,
    })
  } catch {
    return "—"
  }
}

export function isUpcoming(iso: string): boolean {
  try {
    return new Date(iso) > new Date()
  } catch {
    return false
  }
}

export function isPast(iso: string): boolean {
  try {
    return new Date(iso) < new Date()
  } catch {
    return false
  }
}