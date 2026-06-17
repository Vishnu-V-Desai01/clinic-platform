import { notFound } from "next/navigation"
import { getPatient } from "@/features/patients/actions"
import PatientProfile from "@/features/patients/patient-profile"
import ConsentSection from "@/features/consent/components/ConsentSection"

export const metadata = { title: "Patient Profile" }

export default async function PatientPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const result  = await getPatient(id)
  if (!result.success) notFound()

  return (
    <div className="space-y-6">
      <PatientProfile patient={result.data} />
      <ConsentSection patientId={id} />
    </div>
  )
}