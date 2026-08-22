export type AppointmentRequestStatus =
  | 'pending'
  | 'confirmed'
  | 'rejected'
  | 'cancelled'

export type PreferredTimeSlot = 'morning' | 'afternoon' | 'evening'

export type MyAppointmentRequest = {
  id: string
  patientId: string
  clinicId: string
  patientFirstName: string
  patientLastName: string
  clinicName: string
  preferredDate: string
  preferredTimeSlot: PreferredTimeSlot | null
  reason: string | null
  status: AppointmentRequestStatus
  responseNote: string | null
  confirmedAppointmentId: string | null
  respondedAt: string | null
  createdAt: string
  updatedAt: string
}

export type ClinicAppointmentRequest = {
  id: string
  patientId: string
  preferredDate: string
  preferredTimeSlot: PreferredTimeSlot | null
  reason: string | null
  status: AppointmentRequestStatus
  responseNote: string | null
  respondedAt: string | null
  createdAt: string
  updatedAt: string
  patient: {
    firstName: string
    lastName: string
    mrn: string | null
  } | null
}

// A patient's family card enriched with the assigned doctor's name.
// Used by the appointment-request dropdown so patients see which
// doctor they'd be requesting time with, not just the clinic name.
export type FamilyCardWithDoctor = {
  id: string
  firstName: string
  lastName: string
  clinicName: string
  doctorName: string | null
}