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
  // Admin-granted permission to manage pharmacy inventory and dispense.
  // is_clinic_admin implies access regardless of this flag's value — see
  // am_i_pharmacy_user() in Postgres and assertPharmacyWriter/Reader in
  // src/features/pharmacy/actions.ts. This field reflects the raw DB column,
  // not the resolved "can this person use pharmacy" answer.
  pharmacy_access: boolean
  created_at: string
}