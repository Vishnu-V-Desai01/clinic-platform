import { redirect } from 'next/navigation'
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { PatientSidebar } from '@/components/patient-sidebar'
import { ModeToggle } from '@/components/mode-toggle'
import { getOrCreateProfile } from '@/lib/supabase/profile'
import { getMyPortalStatus } from '@/features/portal/actions'

export default async function PatientLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const profile = await getOrCreateProfile()

  if (!profile) redirect('/sign-in')
  if (profile.status !== 'active') redirect('/account-suspended')
  if (profile.role !== 'patient') redirect('/dashboard')

  const statusResult = await getMyPortalStatus()
  const familyCode = statusResult.success ? statusResult.data.familyCode : ''

  return (
    <SidebarProvider>
      <PatientSidebar familyCode={familyCode} />
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-12 shrink-0 items-center gap-2 border-b bg-background px-4">
          <SidebarTrigger className="-ml-1" />
          <div className="flex-1" />
          <span className="text-xs text-muted-foreground">CURAKIN Patient Portal</span>
          <ModeToggle />
        </header>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto min-h-0 p-4 md:p-6">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}