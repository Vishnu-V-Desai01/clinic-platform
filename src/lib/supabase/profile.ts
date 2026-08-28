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
  // Admin-granted permission to manage pharmacy inventory and dispense
  // medicine. Independent of role/staff_type — is_clinic_admin implies this
  // too, but that's resolved separately wherever access is checked, not
  // folded into this field itself. See am_i_pharmacy_user() in Postgres and
  // assertPharmacyReader/assertPharmacyWriter in src/features/pharmacy/actions.ts.
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

export async function createClinicAndBecomeAdmin(clinicName: string): Promise<Profile> {
  const user = await currentUser()
  if (!user) throw new Error('Not authenticated')

  const supabase = createServerSupabaseClient()

  const { data, error } = await supabase.rpc('create_clinic_and_become_admin', {
    p_clinic_name: clinicName,
    p_email: user.emailAddresses[0]?.emailAddress ?? '',
    p_full_name: user.firstName
      ? `${user.firstName} ${user.lastName ?? ''}`.trim()
      : null,
  })

  if (error) throw new Error(`Failed to create clinic: ${error.message}`)
  return data as Profile
}

// fullNameOverride is supplied when the user signed up with email/password
// and Clerk has no firstName/lastName — the acceptance UI collects it instead.
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

// requireAdmin: for clinic-admin-only surfaces (the /dashboard/admin route
// group and its server actions). role alone (doctor/staff) is NOT enough —
// is_clinic_admin is the actual admin flag. A non-admin doctor or staff
// member must be redirected the same as an unauthenticated user; the route
// existing is not something we confirm to them.
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