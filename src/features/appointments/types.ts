// src/features/appointments/types.ts
//
// All appointment-related types live here — one source of truth.
// Convention: data is always in DATABASE form (status "scheduled", times in ISO 8601).
// Friendly labels ("Scheduled", "2:30 PM") are applied only when rendering.

/* ----------------------------- Value types ------------------------------ */

export type AppointmentStatus = "scheduled" | "completed" | "cancelled" | "no_show"

/* ------------------------- Database row (snake_case) --------------------- */
// Mirrors the `appointments` table exactly. This is what a SELECT returns.

export interface AppointmentRecord {
  id: string
  clinic_id: string
  patient_id: string
  doctor_id: string
  appointment_date: string       // ISO 8601: "2026-06-20T14:30:00+05:30"
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
// Returned by list and detail queries — patient and doctor names are
// joined in so the UI doesn't need extra round-trips.

export interface AppointmentWithContext extends AppointmentRecord {
  patient_first_name: string
  patient_last_name: string
  patient_mrn: string | null
  doctor_full_name: string
  doctor_specialization: string | null
}

/* --------------------------- Form values (camelCase) --------------------- */
// What the create form works with.

export interface AppointmentFormValues {
  patientId: string
  doctorId: string
  appointmentDate: string   // "YYYY-MM-DD"
  appointmentTime: string   // "HH:MM"
  durationMinutes: number
  chiefComplaint: string
}

/* ------------------------- List row (display shape) ---------------------- */
// Compact shape for the appointments list table.

export interface AppointmentListItem {
  id: string
  patientName: string
  patientMrn: string | null
  doctorName: string
  appointmentDate: string   // "YYYY-MM-DD"
  appointmentTime: string   // "HH:MM"
  durationMinutes: number
  status: AppointmentStatus
  chiefComplaint: string | null
}

/* -------------------- Detail view (display shape) ----------------------- */
// Richer shape for the single appointment detail page.

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
// Populated by listDoctors() — drives the doctor dropdown on the form.

export interface DoctorOption {
  id: string                  // profiles.id — stored as appointment.doctor_id
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

/** "2026-06-20" from an ISO timestamp, in IST */
export function formatAppointmentDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-CA", {
      timeZone: "Asia/Kolkata",
      year:     "numeric",
      month:    "2-digit",
      day:      "2-digit",
    }) // en-CA gives YYYY-MM-DD
  } catch {
    return "—"
  }
}

/** "14:30" from an ISO timestamp, in IST */
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

/** "20 Jun 2026, 2:30 PM" — used in detail views and notifications */
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

/** True if the appointment is still in the future — used to decide
 *  whether reschedule / cancel buttons are shown. */
export function isUpcoming(iso: string): boolean {
  try {
    return new Date(iso) > new Date()
  } catch {
    return false
  }
}

/** True if the appointment time has already passed. */
export function isPast(iso: string): boolean {
  try {
    return new Date(iso) < new Date()
  } catch {
    return false
  }
}