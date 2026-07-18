export type AccessGrantStatus = 'pending' | 'approved' | 'denied' | 'revoked' | 'expired'

export type AccessGrant = {
  id: string
  family_account_id: string
  requesting_clinic_id: string
  requesting_doctor_id: string
  request_note: string | null
  granted_patient_id: string | null
  status: AccessGrantStatus
  granted_scopes: string[]
  requested_at: string
  responded_at: string | null
  expires_at: string | null
}

export type FamilyAccessRequestView = {
  id: string
  requestingClinicName: string
  requestingDoctorName: string | null
  requestNote: string | null
  grantedPatientId: string | null
  status: AccessGrantStatus
  requestedAt: string
  respondedAt: string | null
  expiresAt: string | null
}

export type FamilyPatientCard = {
  id: string
  firstName: string
  lastName: string
  clinicName: string
  createdAt: string
}