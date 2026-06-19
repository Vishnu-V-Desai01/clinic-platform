import { notFound } from "next/navigation"
import { requireRole } from "@/lib/supabase/profile"
import { getPatient } from "@/features/patients/actions"
import NewEncounterFormClient from "@/features/medical-records/components/NewEncounterFormClient"

interface Props {
  params: Promise<{ id: string }>
}

export default async function NewEncounterPage({ params }: Props) {
  const { id } = await params

  await requireRole("doctor")

  const patientResult = await getPatient(id)
  if (!patientResult.success) return notFound()

  const patient     = patientResult.data
  const patientName = `${patient.first_name} ${patient.last_name}`
  const patientMrn  = patient.patient_id_number ?? "—"

  return (
    <NewEncounterFormClient
      patientId={id}
      patientName={patientName}
      patientMrn={patientMrn}
    />
  )
}