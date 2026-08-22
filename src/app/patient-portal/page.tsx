import { redirect } from 'next/navigation'
import {
  getOrCreateProfile,
  claimFamilyAccountAndCreatePatientProfile,
} from '@/lib/supabase/profile'

// Dedicated entry point for patients arriving via the WhatsApp
// "view your dashboard" link. Kept separate from "/" on purpose —
// this route only ever runs the patient-claim path, never clinic
// creation, so that collision can't happen here.
export default async function PatientPortalPage() {
  const profile = await getOrCreateProfile()

  if (profile) {
    if (profile.status !== 'active') {
      redirect('/account-suspended')
    }
    // Patients have their own shell; everyone else gets the clinical shell.
    redirect(profile.role === 'patient' ? '/portal' : '/dashboard')
  }

  const claimedProfile = await claimFamilyAccountAndCreatePatientProfile()
  if (claimedProfile) {
    // New claim: always a patient role — send to patient home.
    redirect('/portal')
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="max-w-md space-y-2 text-center">
        <h1 className="text-2xl font-semibold">No patient record found</h1>
        <p className="text-sm text-muted-foreground">
          We couldn&apos;t find a patient record matching your account&apos;s
          email address. Please check with your clinic to confirm the email
          they registered you with.
        </p>
      </div>
    </div>
  )
}