import { currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from './server'

const DEFAULT_CLINIC_ID = '11111111-1111-1111-1111-111111111111'

export type Role = 'doctor' | 'staff' | 'patient'

export type Profile = {
  id: string
  clerk_user_id: string
  email: string
  full_name: string | null
  role: Role
  clinic_id: string
}

export async function getOrCreateProfile(): Promise<Profile | null> {
  const user = await currentUser()
  if (!user) return null

  const supabase = createServerSupabaseClient()

  const { data: existing } = await supabase
    .from('profiles')
    .select('*')
    .eq('clerk_user_id', user.id)
    .maybeSingle()

  if (existing) return existing as Profile

  const { data: created, error } = await supabase
    .from('profiles')
    .insert({
      clerk_user_id: user.id,
      email: user.emailAddresses[0]?.emailAddress ?? '',
      full_name: user.firstName
        ? `${user.firstName} ${user.lastName ?? ''}`.trim()
        : null,
      role: 'patient',
      clinic_id: DEFAULT_CLINIC_ID,
    })
    .select()
    .single()

  if (error) {
    console.error('Failed to create profile:', error)
    return null
  }

  return created as Profile
}

// Pure check — does this profile have one of the given roles?
// Use for conditional UI, e.g.: {hasRole(profile, 'doctor') && <DoctorOnlyThing />}
export function hasRole(profile: Profile | null, ...allowed: Role[]): boolean {
  return profile !== null && allowed.includes(profile.role)
}

// For PAGES that only certain roles should reach.
// Anyone else is sent back to "/".
//
// Future usage example (an analytics page):
//   export default async function AnalyticsPage() {
//     const profile = await requireRole('doctor')
//     // only doctors get past this line
//   }
export async function requireRole(...allowed: Role[]): Promise<Profile> {
  const profile = await getOrCreateProfile()
  if (!profile || !allowed.includes(profile.role)) {
    redirect('/')
  }
  return profile
}