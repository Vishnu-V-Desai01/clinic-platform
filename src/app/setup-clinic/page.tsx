import { currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { getOrCreateProfile } from '@/lib/supabase/profile'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { CreateClinicForm } from '@/features/onboarding/components/CreateClinicForm'

// The ONLY page that renders the clinic-creation form. Reached by a
// deliberate choice on "/". The real boundary is the server action and the
// database function; this page just avoids showing the form to people who
// would be refused anyway.
export default async function SetupClinicPage() {
  let user
  try {
    user = await currentUser()
  } catch {
    user = null
  }
  if (!user) {
    redirect('/sign-in?redirect_url=/setup-clinic')
  }

  const profile = await getOrCreateProfile()
  if (profile) {
    if (profile.status !== 'active') {
      redirect('/account-suspended')
    }
    redirect('/dashboard')
  }

  const verifiedEmail = user.emailAddresses[0]?.emailAddress
  if (verifiedEmail) {
    const supabase = createServerSupabaseClient()
    const { data: isPatientEmail, error } = await supabase.rpc(
      'email_matches_existing_patient',
      { p_email: verifiedEmail }
    )
    // Fail closed: if the check cannot be made, do not show the form.
    if (error) {
      redirect('/')
    }
    if (isPatientEmail) {
      redirect('/patient-portal')
    }
  }

  const defaultFullName = user.firstName
    ? `${user.firstName} ${user.lastName ?? ''}`.trim()
    : ''

  return <CreateClinicForm defaultFullName={defaultFullName} />
}