// Shared types for the staff/doctor operations dashboard.
// Every list here is clinic-scoped and read via server actions only.

export type TimeSlot = "morning" | "afternoon" | "evening";

export interface PendingRequestItem {
  id: string;
  patientId: string;
  patientName: string;
  patientPhone: string;
  preferredDate: string; // YYYY-MM-DD
  preferredTimeSlot: TimeSlot | null;
  reason: string | null;
  createdAt: string;
}

export interface TodayAppointmentItem {
  id: string;
  patientId: string;
  patientName: string;
  doctorId: string;
  doctorName: string;
  appointmentDate: string; // ISO timestamptz
  durationMinutes: number;
  status: "scheduled" | "completed" | "cancelled" | "no_show";
  chiefComplaint: string | null;
}

export interface NoPortalPatientItem {
  id: string;
  patientName: string;
  phone: string;
  patientIdNumber: string | null;
  createdAt: string;
}

export interface OutstandingPaymentItem {
  id: string;
  patientId: string;
  patientName: string;
  amountCharged: number;
  amountPaid: number;
  outstandingBalance: number;
  paymentStatus: string | null;
  isOverdue: boolean;
  createdAt: string;
}

export interface RemindersDueSummary {
  count: number;
  // Best-effort preview only — see note in actions.ts. Not an exact
  // match to what the cron will actually send today.
}
export interface DoctorOption {
  id: string;
  name: string;
}

export interface DoctorOption {
  id: string;
  name: string;
}