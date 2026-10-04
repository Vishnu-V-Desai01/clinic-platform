import Link from 'next/link'
import { currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { Building2, UserRound } from 'lucide-react'
import { getOrCreateProfile } from '@/lib/supabase/profile'
import { createServerSupabaseClient } from '@/lib/supabase/server'

// Entry point for every signed-in user. It only ROUTES -- it never renders
// the clinic-creation form. Clinic setup lives at /setup-clinic, reached
// only by a deliberate choice below.
export default async function RootPage() {
  const profile = await getOrCreateProfile()
  if (profile) {
    if (profile.status !== 'active') {
      redirect('/account-suspended')
    }
    redirect('/dashboard')
  }

  // An authenticated user with no profile is either a patient who has not
  // been linked yet or a doctor who has not set up a clinic. If the email
  // belongs to an existing patient record, send them straight to the
  // patient claim flow.
  let user
  try {
    user = await currentUser()
  } catch {
    user = null
  }
  const verifiedEmail = user?.emailAddresses[0]?.emailAddress
  if (verifiedEmail) {
    const supabase = createServerSupabaseClient()
    const { data: isPatientEmail } = await supabase.rpc(
      'email_matches_existing_patient',
      { p_email: verifiedEmail }
    )
    if (isPatientEmail) {
      redirect('/patient-portal')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
      <div className="border border-border bg-card rounded-xl shadow-sm max-w-md w-full p-8 space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold text-foreground">Welcome to CURAKIN</h1>
          <p className="text-sm text-muted-foreground">
            Tell us how you will be using CURAKIN.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <Link
            href="/patient-portal"
            className="flex items-center gap-3 rounded-lg border border-border bg-background p-4 text-left hover:bg-muted/50"
          >
            <UserRound className="size-5 text-primary" aria-hidden="true" />
            <span>
              <span className="block text-sm font-medium text-foreground">I am a patient</span>
              <span className="block text-xs text-muted-foreground">
                View appointments, medicines and records from your clinic.
              </span>
            </span>
          </Link>

          <Link
            href="/setup-clinic"
            className="flex items-center gap-3 rounded-lg border border-border bg-background p-4 text-left hover:bg-muted/50"
          >
            <Building2 className="size-5 text-primary" aria-hidden="true" />
            <span>
              <span className="block text-sm font-medium text-foreground">
                I am a doctor setting up a new clinic
              </span>
              <span className="block text-xs text-muted-foreground">
                Create your clinic and start your free trial.
              </span>
            </span>
          </Link>
        </div>

        <p className="text-xs text-muted-foreground text-center leading-relaxed">
          Invited by an existing clinic? Use the invitation link from your email instead.
        </p>
      </div>
    </div>
  )
}