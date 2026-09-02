import { currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from './server'

export type Role = 'doctor' | 'staff' | 'patient'

export type Profile = {
  id: string
  clerk_user_id: string
  email: string
  full_name: string | null
  role: Role
  clinic_id: string | null
  is_clinic_admin: boolean
  staff_type: 'receptionist' | 'nurse' | 'assistant' | 'pharmacist' | null
  status: 'active' | 'suspended' | 'removed'
  has_admin_onboarded: boolean
  pharmacy_access: boolean
}

export async function getOrCreateProfile(): Promise<Profile | null> {
  let user
  try {
    user = await currentUser()
  } catch {
    return null
  }
  if (!user) return null

  const supabase = createServerSupabaseClient()

  const { data: existing } = await supabase
    .from('profiles')
    .select('*')
    .eq('clerk_user_id', user.id)
    .maybeSingle()

  return existing as Profile | null
}

// Clinic detail fields are all optional — matches the optionality of the
// same fields on clinic-settings-form.tsx, so a new admin can skip them at
// signup and fill them in later via Settings. tosVersion is required: the
// server action always supplies it from legal-content.ts, and the RPC
// itself refuses to create a clinic without it (defense-in-depth).
// Clinic detail fields are all optional — matches the optionality of the
// same fields on clinic-settings-form.tsx, so a new admin can skip them at
// signup and fill them in later via Settings. fullNameOverride follows the
// same pattern as acceptStaffInvitation below: Clerk doesn't always supply
// firstName/lastName (notably on email/password sign-up), so the onboarding
// form collects it directly rather than risk profiles.full_name landing
// null. tosVersion is required: the server action always supplies it from
// legal-content.ts, and the RPC itself refuses to create a clinic without
// it (defense-in-depth).
export async function createClinicAndBecomeAdmin(input: {
  clinicName: string
  fullNameOverride?: string
  phone?: string | null
  contactEmail?: string | null
  address?: string | null
  city?: string | null
  state?: string | null
  postalCode?: string | null
  licenseNumber?: string | null
  gstNumber?: string | null
  hfrId?: string | null
  tosVersion: string
}): Promise<Profile> {
  const user = await currentUser()
  if (!user) throw new Error('Not authenticated')

  const clerkName = user.firstName
    ? `${user.firstName} ${user.lastName ?? ''}`.trim()
    : null

  const supabase = createServerSupabaseClient()

  const { data, error } = await supabase.rpc('create_clinic_and_become_admin', {
    p_clinic_name: input.clinicName,
    p_email: user.emailAddresses[0]?.emailAddress ?? '',
    p_full_name: input.fullNameOverride?.trim() || clerkName,
    p_clinic_phone: input.phone ?? null,
    p_clinic_contact_email: input.contactEmail ?? null,
    p_clinic_address: input.address ?? null,
    p_clinic_city: input.city ?? null,
    p_clinic_state: input.state ?? null,
    p_clinic_postal_code: input.postalCode ?? null,
    p_clinic_license_number: input.licenseNumber ?? null,
    p_clinic_gst_number: input.gstNumber ?? null,
    p_clinic_hfr_id: input.hfrId ?? null,
    p_tos_version: input.tosVersion,
  })

  if (error) throw new Error(`Failed to create clinic: ${error.message}`)
  return data as Profile
}

export async function acceptStaffInvitation(
  token: string,
  fullNameOverride?: string
): Promise<Profile> {
  const user = await currentUser()
  if (!user) throw new Error('Not authenticated')

  const supabase = createServerSupabaseClient()

  const clerkName = user.firstName
    ? `${user.firstName} ${user.lastName ?? ''}`.trim()
    : null

  const { data, error } = await supabase.rpc('accept_staff_invitation', {
    p_token: token,
    p_email: user.emailAddresses[0]?.emailAddress ?? '',
    p_full_name: fullNameOverride?.trim() || clerkName,
  })

  if (error) throw new Error(`Failed to accept invitation: ${error.message}`)
  return data as Profile
}

export async function claimFamilyAccountAndCreatePatientProfile(): Promise<Profile | null> {
  let user
  try {
    user = await currentUser()
  } catch {
    return null
  }
  if (!user) return null

  const verifiedEmail = user.emailAddresses[0]?.emailAddress
  if (!verifiedEmail) return null

  const supabase = createServerSupabaseClient()

  const { data: existing } = await supabase
    .from('profiles')
    .select('*')
    .eq('clerk_user_id', user.id)
    .maybeSingle()

  if (existing) return existing as Profile

  const { data: familyAccount, error: claimError } = await supabase.rpc(
    'claim_family_account',
    { p_email: verifiedEmail }
  )

  if (claimError) {
    if (claimError.message?.includes('No patient record found')) return null
    throw new Error(`Failed to claim family account: ${claimError.message}`)
  }

  const { data: newProfile, error: profileError } = await supabase
    .from('profiles')
    .insert({
      clerk_user_id: user.id,
      email: verifiedEmail,
      full_name: user.firstName
        ? `${user.firstName} ${user.lastName ?? ''}`.trim()
        : null,
      role: 'patient',
      clinic_id: null,
    })
    .select()
    .single()

  if (profileError) throw new Error(`Failed to create patient profile: ${profileError.message}`)
  return newProfile as Profile
}

export async function claimFamilyAccountByPhoneAndCreatePatientProfile(
  rawPhone: string
): Promise<{ success: true; profile: Profile } | { success: false; error: string }> {
  let user
  try {
    user = await currentUser()
  } catch {
    return { success: false, error: 'Not authenticated' }
  }
  if (!user) return { success: false, error: 'Not authenticated' }

  const verifiedEmail = user.emailAddresses[0]?.emailAddress
  if (!verifiedEmail) {
    return { success: false, error: 'Your account has no verified email address' }
  }

  const digitsOnly = rawPhone.replace(/\D/g, '')
  if (!/^[6-9]\d{9}$/.test(digitsOnly)) {
    return { success: false, error: 'Enter a valid 10-digit mobile number' }
  }

  const supabase = createServerSupabaseClient()

  const { data: existing } = await supabase
    .from('profiles')
    .select('*')
    .eq('clerk_user_id', user.id)
    .maybeSingle()

  if (existing) return { success: true, profile: existing as Profile }

  const { error: claimError } = await supabase.rpc('claim_family_account_by_phone', {
    p_phone: digitsOnly,
    p_email: verifiedEmail,
  })

  if (claimError) {
    if (claimError.message?.includes('No patient record found')) {
      return {
        success: false,
        error: 'No patient record found for that phone number. Please check with your clinic.',
      }
    }
    if (claimError.message?.includes('already claimed')) {
      return {
        success: false,
        error: 'This account has already been claimed by a different login.',
      }
    }
    return { success: false, error: `Failed to claim family account: ${claimError.message}` }
  }

  const { data: newProfile, error: profileError } = await supabase
    .from('profiles')
    .insert({
      clerk_user_id: user.id,
      email: verifiedEmail,
      full_name: user.firstName
        ? `${user.firstName} ${user.lastName ?? ''}`.trim()
        : null,
      role: 'patient',
      clinic_id: null,
    })
    .select()
    .single()

  if (profileError) {
    return { success: false, error: `Failed to create patient profile: ${profileError.message}` }
  }

  return { success: true, profile: newProfile as Profile }
}

export function hasRole(profile: Profile | null, ...allowed: Role[]): boolean {
  return profile !== null && allowed.includes(profile.role)
}

export async function requireRole<T extends Role[]>(
  ...allowed: T
): Promise<Profile & { role: T[number] }> {
  const profile = await getOrCreateProfile()
  if (!profile || !allowed.includes(profile.role)) {
    redirect('/')
  }
  if (profile.status !== 'active') {
    redirect('/account-suspended')
  }
  return profile as Profile & { role: T[number] }
}

export async function requireAdmin(): Promise<Profile & { is_clinic_admin: true }> {
  const profile = await getOrCreateProfile()
  if (!profile || !(profile.role === 'doctor' || profile.role === 'staff') || !profile.is_clinic_admin) {
    redirect('/')
  }
  if (profile.status !== 'active') {
    redirect('/account-suspended')
  }
  return profile as Profile & { is_clinic_admin: true }
}