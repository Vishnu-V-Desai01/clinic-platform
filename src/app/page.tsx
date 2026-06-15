import { currentUser } from '@clerk/nextjs/server'
import { UserButton } from '@clerk/nextjs'
import { getOrCreateProfile, hasRole } from '@/lib/supabase/profile'

export default async function Home() {
  const user = await currentUser()
  const profile = await getOrCreateProfile()

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-semibold">
        Welcome, {user?.firstName ?? user?.emailAddresses?.[0]?.emailAddress}
      </h1>
      <p className="text-gray-500">
        {profile ? `Role: ${profile.role}` : 'Could not load your profile.'}
      </p>
      {hasRole(profile, 'doctor') && (
        <p className="text-sm text-green-600">Doctor-level access confirmed</p>
      )}
      <UserButton />
    </main>
  )
}