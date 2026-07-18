export type ClinicUserStatus = 'active' | 'suspended' | 'removed'

export type ClinicUser = {
  id: string
  clerk_user_id: string
  email: string
  full_name: string | null
  role: 'doctor' | 'staff' | 'patient'
  clinic_id: string | null
  is_clinic_admin: boolean
  staff_type: 'receptionist' | 'nurse' | 'assistant' | 'pharmacist' | null
  status: ClinicUserStatus
  created_at: string
}