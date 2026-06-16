// src/app/(app)/patients/[id]/edit/page.tsx
import { notFound } from "next/navigation"
import { getPatient } from "@/features/patients/actions"
import PatientForm from "@/features/patients/patient-form"

export const metadata = { title: "Edit Patient" }

export default async function EditPatientPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const result = await getPatient(id)

  if (!result.success) notFound()

  return <PatientForm mode="edit" patient={result.data} />
}