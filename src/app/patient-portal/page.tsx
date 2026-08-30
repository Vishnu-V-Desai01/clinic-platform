import { redirect } from 'next/navigation'
import {
  getOrCreateProfile,
  claimFamilyAccountAndCreatePatientProfile,
} from '@/lib/supabase/profile'
import PhoneClaimForm from './phone-claim-form'

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

  // Email-based claim found nothing (either the patient has no email on
  // file, or their email doesn't match any patient row). Item 3a: rather
  // than a dead end, offer a phone-based claim as a fallback — this is
  // exactly the case a patient without an email hits.
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <PhoneClaimForm />
    </div>
  )
}