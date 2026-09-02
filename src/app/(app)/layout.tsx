import { redirect } from 'next/navigation'
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
  // them to '/sign-in' instead was wrong — they're already signed in, so
  // Clerk's fallbackRedirectUrl bounces them straight back to /dashboard,
  // which has no profile, which redirects to /sign-in again: an infinite
  // loop. This was the root cause of today's stuck sign-up/sign-in screens.
  if (!profile) redirect('/')
  // Patients have a separate shell — never enter the clinical (app) group.
  if (profile.role === 'patient') redirect('/portal')

  // Nav-visibility only — deliberately non-fatal. A failed fetch here should
  // hide the Pharmacy link, not break the whole clinical shell; the real
  // enforcement is RLS + assertPharmacyReader/assertPharmacyEnabled in
  // src/features/pharmacy/actions.ts, not this flag.
  let pharmacyEnabled = false
  if (profile.clinic_id) {
    const supabase = createServerSupabaseClient()
    const { data: clinic, error } = await supabase
      .from('clinics')
      .select('pharmacy_enabled')
      .eq('id', profile.clinic_id)
      .single()
      .returns<{ pharmacy_enabled: boolean }>()

    if (error) {
      console.error('[AppLayout] pharmacy_enabled fetch failed', error)
    } else {
      pharmacyEnabled = clinic?.pharmacy_enabled ?? false
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