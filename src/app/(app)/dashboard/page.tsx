import { redirect } from 'next/navigation'
import { getOrCreateProfile } from '@/lib/supabase/profile'

export default async function DashboardPage() {
  const profile = await getOrCreateProfile()
  if (!profile) redirect('/sign-in')

  const heading =
    profile.role === 'patient'
      ? `Welcome, ${profile.full_name ?? 'there'}`
      : `Good day, ${profile.full_name ?? profile.email}`

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{heading}</h1>
        <p className="capitalize text-muted-foreground">{profile.role} dashboard</p>
      </div>
      <div className="rounded-lg border border-dashed p-8 text-center">
        <p className="text-muted-foreground">
          Dashboard analytics will be built after the Payments feature.
        </p>
      </div>
    </div>
  )
}