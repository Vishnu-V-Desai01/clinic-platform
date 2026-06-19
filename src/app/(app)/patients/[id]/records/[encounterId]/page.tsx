import { notFound } from "next/navigation"
import { getOrCreateProfile, requireRole } from "@/lib/supabase/profile"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { getEncounterWithDetails } from "@/features/medical-records/actions"
import EncounterDetailClient from "@/features/medical-records/components/EncounterDetailClient"

interface Props {
  params: Promise<{ id: string; encounterId: string }>
}

export default async function EncounterDetailPage({ params }: Props) {
  const { id, encounterId } = await params

  await requireRole("doctor", "staff")
  const profile = await getOrCreateProfile()
  if (!profile) return notFound()

  const result = await getEncounterWithDetails(encounterId)
  if ("error" in result) return notFound()

  const { data: encounter } = result

  // Guard: encounter must belong to this patient
  if (encounter.patient_id !== id) return notFound()

  // Fetch doctor's display name from profiles
  const supabase = await createServerSupabaseClient()
  const { data: doctorProfile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", encounter.doctor_id)
    .single()

  return (
    <EncounterDetailClient
      encounter={encounter}
      patientId={id}
      userRole={profile.role as "doctor" | "staff"}
      doctorName={doctorProfile?.full_name ?? "Unknown Doctor"}
    />
  )
}