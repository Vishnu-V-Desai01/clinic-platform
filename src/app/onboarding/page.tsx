import { redirect } from 'next/navigation'
import { getOrCreateProfile } from '@/lib/supabase/profile'
import { FirstLoginWelcomeClient } from '@/features/onboarding/components/FirstLoginWelcomeClient'

export default async function OnboardingPage() {
  const profile = await getOrCreateProfile()

  if (!profile) redirect('/sign-in')
  if (profile.status !== 'active') redirect('/account-suspended')

  // Already onboarded or not an admin-doctor — nothing to show here
  if (!profile.is_clinic_admin || profile.has_admin_onboarded) {
    redirect('/dashboard')
  }

  return <FirstLoginWelcomeClient doctorName={profile.full_name ?? profile.email} />
}