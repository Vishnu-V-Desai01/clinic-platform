import { redirect } from 'next/navigation'
import { currentUser } from '@clerk/nextjs/server'
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/app-sidebar'
import { getOrCreateProfile } from '@/lib/supabase/profile'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const profile = await getOrCreateProfile()
  // An authenticated user with no profile is either mid-onboarding (new
  // doctor who hasn't created a clinic yet) or a patient who landed here
  // by mistake. '/' already contains the correct routing for both cases
  // (see RootPage: patient-email check, then CreateClinicForm). Sending
  // them to '/sign-in' instead was wrong â€” they're already signed in, so
  // Clerk's fallbackRedirectUrl bounces them straight back to /dashboard,
  // which has no profile, which redirects to /sign-in again: an infinite
  // loop. This was the root cause of today's stuck sign-up/sign-in screens.
  if (!profile) redirect('/')
  // Patients have a separate shell â€” never enter the clinical (app) group.
  if (profile.role === 'patient') redirect('/portal')

  // Nav-visibility only â€” deliberately non-fatal. A failed fetch here should
  // hide the Pharmacy link, not break the whole clinical shell; the real
  // enforcement is RLS + assertPharmacyReader/assertPharmacyEnabled in
  // src/features/pharmacy/actions.ts, not this flag.
  //
  // PERF NOTE: this used to be a second, sequential Supabase round trip
  // after getOrCreateProfile() resolved (profiles -> clinics, one after
  // another). Since profiles.clinic_id -> clinics.id is a real FK
  // relationship, we fetch both in a single joined query instead, scoped
  // entirely to this layout. getOrCreateProfile() above is unchanged and
  // still used for the redirect checks and by every action file downstream
  // via requireRole()/requireAdmin() -- those all continue to hit React's
  // per-request cache() and cost nothing extra. This block just avoids a
  // second network round trip for the one extra field (pharmacy_enabled)
  // this layout alone needs. Requires its own currentUser() call since it
  // queries a different shape than getOrCreateProfile() returns.
  let pharmacyEnabled = false
  if (profile.clinic_id) {
    try {
      const user = await currentUser()
      if (user) {
        const supabase = createServerSupabaseClient()
        const { data: profileWithClinic, error } = await supabase
          .from('profiles')
          .select('clinic_id, clinics(pharmacy_enabled)')
          .eq('clerk_user_id', user.id)
          .maybeSingle()
          .returns<{ clinic_id: string | null; clinics: { pharmacy_enabled: boolean } | null }>()

        if (error) {
          console.error('[AppLayout] pharmacy_enabled fetch failed', error)
        } else {
          pharmacyEnabled = profileWithClinic?.clinics?.pharmacy_enabled ?? false
        }
      }
    } catch (err) {
      console.error('[AppLayout] pharmacy_enabled fetch failed', err)
    }
  }

  return (
    <SidebarProvider>
      <AppSidebar profile={profile} pharmacyEnabled={pharmacyEnabled} />
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-12 shrink-0 items-center gap-2 border-b bg-background px-4">
          <SidebarTrigger className="-ml-1" />
        </header>
        {/* overflow-y-auto + min-h-0 allow this flex child to scroll */}
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto min-h-0 p-4 md:p-6">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}