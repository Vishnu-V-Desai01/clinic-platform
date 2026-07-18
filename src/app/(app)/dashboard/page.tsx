import { redirect } from 'next/navigation'
import { getOrCreateProfile } from '@/lib/supabase/profile'

export default async function DashboardPage() {
  const profile = await getOrCreateProfile()
  if (!profile) redirect('/sign-in')

  if (profile.status !== 'active') {
    redirect('/account-suspended')
  }

  // First-ever login for a clinic owner — show welcome outside the app shell
  if (profile.role === 'doctor' && profile.is_clinic_admin && !profile.has_admin_onboarded) {
    redirect('/onboarding')
  }

  if (profile.role === 'doctor' || profile.role === 'staff') {
    redirect('/dashboard/patients')
  }

  // Patient placeholder — Chat 21 builds the real dashboard
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Welcome, {profile.full_name ?? 'there'}</h1>
        <p className="capitalize text-muted-foreground">{profile.role} dashboard</p>
      </div>
      <div className="rounded-lg border border-dashed p-8 text-center">
        <p className="text-muted-foreground">Your dashboard is coming soon.</p>
      </div>
    </div>
  )
}