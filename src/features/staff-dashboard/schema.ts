import { z } from "zod";

export const confirmAppointmentRequestSchema = z.object({
  requestId: z.string().uuid(),
  doctorId: z.string().uuid(),
  appointmentDate: z.string().datetime({ message: "Invalid appointment date/time" }),
  durationMinutes: z.coerce.number().int().min(5).max(240).default(30),
  chiefComplaint: z.string().trim().max(1000).optional().nullable(),
});
export type ConfirmAppointmentRequestInput = z.infer<typeof confirmAppointmentRequestSchema>;

export const rejectAppointmentRequestSchema = z.object({
  requestId: z.string().uuid(),
  responseNote: z.string().trim().min(1, "Please give a reason").max(500),
});
export type RejectAppointmentRequestInput = z.infer<typeof rejectAppointmentRequestSchema>;

export const updatePatientEmailSchema = z.object({
  patientId: z.string().uuid(),
  email: z.string().trim().email("Enter a valid email address"),
});
export type UpdatePatientEmailInput = z.infer<typeof updatePatientEmailSchema>;