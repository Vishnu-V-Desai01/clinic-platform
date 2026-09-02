import { currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { getOrCreateProfile } from '@/lib/supabase/profile'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { CreateClinicForm } from '@/features/onboarding/components/CreateClinicForm'

export default async function RootPage() {
  const profile = await getOrCreateProfile()
  if (profile) {
    if (profile.status !== 'active') {
      redirect('/account-suspended')
    }
    redirect('/dashboard')
  }
  // Security hardening: an authenticated user with no profile normally
  // means "new doctor setting up a clinic" — but it's also exactly what
  // a patient looks like if a sign-up redirect ever misroutes them here
  // (see the AFTER_SIGN_UP_URL incident, Item 3). Before rendering the
  // free clinic-creation form, check whether this email actually belongs
  // to an existing patient record. If it does, send them to the correct
  // claim flow instead of letting them create a clinic.
  let user
  try {
    user = await currentUser()
  } catch {
    user = null
  }
  const verifiedEmail = user?.emailAddresses[0]?.emailAddress
  if (verifiedEmail) {
    const supabase = createServerSupabaseClient()
    const { data: isPatientEmail } = await supabase.rpc(
      'email_matches_existing_patient',
      { p_email: verifiedEmail }
    )
    if (isPatientEmail) {
      redirect('/patient-portal')
    }
  }

  // Pre-fills the "your name" field when Clerk already has it (e.g. Google
  // sign-up). Email/password sign-ups get an empty field and must type it
  // once — Clerk doesn't collect a name for that method.
  const defaultFullName = user?.firstName
    ? `${user.firstName} ${user.lastName ?? ''}`.trim()
    : ''

  return <CreateClinicForm defaultFullName={defaultFullName} />
}