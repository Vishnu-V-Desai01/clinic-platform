import { redirect } from 'next/navigation'
import { getOrCreateProfile } from '@/lib/supabase/profile'
import { CreateClinicForm } from '@/features/onboarding/components/CreateClinicForm'

export default async function RootPage() {
  const profile = await getOrCreateProfile()

  if (profile) {
    if (profile.status !== 'active') {
      redirect('/account-suspended')
    }
    redirect('/dashboard')
  }

  return <CreateClinicForm />
}