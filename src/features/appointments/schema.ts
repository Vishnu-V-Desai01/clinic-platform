// src/features/appointments/schema.ts
//
// Server-side Zod validation for every appointment mutation.
// The form sends camelCase values; these schemas check and clean them
// BEFORE any server action writes to the database.

import { z } from "zod"
import { STATUS_OPTIONS, type AppointmentStatus } from "./types"

const STATUS_VALUES = STATUS_OPTIONS.map((o) => o.value)

/* -------------------------------------------------------------------------- */
/*  createAppointmentSchema                                                    */
/*  Used when booking a new appointment.                                      */
/* -------------------------------------------------------------------------- */

export const createAppointmentSchema = z
  .object({
    patientId: z.string().uuid("Invalid patient"),
    doctorId:  z.string().uuid("Invalid doctor"),

    appointmentDate: z
      .string()
      .min(1, "Date is required")
      .refine((v) => !Number.isNaN(Date.parse(v)), { message: "Invalid date" }),

    appointmentTime: z
      .string()
      .min(1, "Time is required")
      .refine((v) => /^\d{2}:\d{2}$/.test(v), { message: "Time must be HH:MM" }),

    durationMinutes: z
      .number()
      .int()
      .min(15,  "Minimum duration is 15 minutes")
      .max(480, "Maximum duration is 8 hours"),

    chiefComplaint: z
      .string()
      .trim()
      .max(1000, "Chief complaint must be 1000 characters or fewer")
      .transform((v) => (v === "" ? null : v)),
  })
  .refine(
    (data) => {
      // The combined date + time must be in the future
      const iso = `${data.appointmentDate}T${data.appointmentTime}:00+05:30`
      return new Date(iso) > new Date()
    },
    {
      message: "Appointment must be scheduled in the future",
      path: ["appointmentDate"],
    },
  )

/* -------------------------------------------------------------------------- */
/*  rescheduleAppointmentSchema                                                */
/*  Used when moving an existing appointment to a new slot.                   */
/* -------------------------------------------------------------------------- */

export const rescheduleAppointmentSchema = z
  .object({
    appointmentDate: z
      .string()
      .min(1, "Date is required")
      .refine((v) => !Number.isNaN(Date.parse(v)), { message: "Invalid date" }),

    appointmentTime: z
      .string()
      .min(1, "Time is required")
      .refine((v) => /^\d{2}:\d{2}$/.test(v), { message: "Time must be HH:MM" }),

    durationMinutes: z
      .number()
      .int()
      .min(15,  "Minimum duration is 15 minutes")
      .max(480, "Maximum duration is 8 hours"),
  })
  .refine(
    (data) => {
      const iso = `${data.appointmentDate}T${data.appointmentTime}:00+05:30`
      return new Date(iso) > new Date()
    },
    {
      message: "New appointment must be in the future",
      path: ["appointmentDate"],
    },
  )

/* -------------------------------------------------------------------------- */
/*  cancelAppointmentSchema                                                    */
/*  The reason is optional — staff may cancel without leaving a note.         */
/* -------------------------------------------------------------------------- */

export const cancelAppointmentSchema = z.object({
  reason: z
    .string()
    .trim()
    .max(500, "Reason must be 500 characters or fewer")
    .transform((v) => (v === "" ? null : v))
    .optional(),
})

/* -------------------------------------------------------------------------- */
/*  updateAppointmentStatusSchema                                              */
/*  Doctor-only: mark as completed or no_show, optionally add notes.          */
/* -------------------------------------------------------------------------- */

export const updateAppointmentStatusSchema = z.object({
  status: z
    .string()
    .refine(
      (v): v is AppointmentStatus => STATUS_VALUES.includes(v as AppointmentStatus),
      { message: "Invalid status" },
    ),

  doctorNotes: z
    .string()
    .trim()
    .max(5000, "Notes must be 5000 characters or fewer")
    .transform((v) => (v === "" ? null : v))
    .optional(),
})

/* -------------------------------------------------------------------------- */
/*  Exported input / output types                                              */
/* -------------------------------------------------------------------------- */

export type CreateAppointmentInput  = z.input<typeof createAppointmentSchema>
export type CreateAppointmentData   = z.output<typeof createAppointmentSchema>

export type RescheduleAppointmentInput = z.input<typeof rescheduleAppointmentSchema>
export type RescheduleAppointmentData  = z.output<typeof rescheduleAppointmentSchema>

export type CancelAppointmentInput  = z.input<typeof cancelAppointmentSchema>
export type CancelAppointmentData   = z.output<typeof cancelAppointmentSchema>

export type UpdateAppointmentStatusInput = z.input<typeof updateAppointmentStatusSchema>
export type UpdateAppointmentStatusData  = z.output<typeof updateAppointmentStatusSchema>