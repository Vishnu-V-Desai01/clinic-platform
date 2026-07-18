import { getOrCreateProfile } from '@/lib/supabase/profile'

export default async function AccountSuspendedPage() {
  const profile = await getOrCreateProfile()
  const isRemoved = profile?.status === 'removed'

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="max-w-md space-y-2 text-center">
        <h1 className="text-2xl font-semibold">
          {isRemoved ? 'Account removed' : 'Account suspended'}
        </h1>
        <p className="text-sm text-muted-foreground">
          {isRemoved
            ? 'Your account has been removed from this clinic. Contact your clinic administrator if you believe this is a mistake.'
            : 'Your account has been suspended by your clinic administrator. Contact your clinic for more information.'}
        </p>
      </div>
    </div>
  )
}