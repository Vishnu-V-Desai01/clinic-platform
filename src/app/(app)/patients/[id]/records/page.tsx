import { notFound } from "next/navigation"
import { getOrCreateProfile, requireRole } from "@/lib/supabase/profile"
import { getPatient } from "@/features/patients/actions"
import { getEncountersForPatient } from "@/features/medical-records/actions"
import EncounterListClient from "@/features/medical-records/components/EncounterListClient"

interface Props {
  params: Promise<{ id: string }>
}

export default async function PatientRecordsPage({ params }: Props) {
  const { id } = await params

  await requireRole("doctor", "staff")
  const profile = await getOrCreateProfile()
  if (!profile) return notFound()

  const patientResult = await getPatient(id)
  if (!patientResult.success) return notFound()

  const patient     = patientResult.data
  const patientName = `${patient.first_name} ${patient.last_name}`
  const patientMrn  = patient.patient_id_number ?? "—"

  const result      = await getEncountersForPatient(id)
  const encounters  = "data" in result ? result.data : []

  return (
    <EncounterListClient
      patientId={id}
      patientName={patientName}
      patientMrn={patientMrn}
      encounters={encounters}
      userRole={profile.role as "doctor" | "staff"}
    />
  )
}