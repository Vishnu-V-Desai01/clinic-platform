export type InvitationStatus = 'pending' | 'accepted' | 'expired'

export type Invitation = {
  id: string
  clinic_id: string
  email: string
  role: 'doctor' | 'staff'
  staff_type: 'receptionist' | 'nurse' | 'assistant' | 'pharmacist' | null
  token: string
  status: InvitationStatus
  invited_by: string
  created_at: string
  expires_at: string
  accepted_at: string | null
}