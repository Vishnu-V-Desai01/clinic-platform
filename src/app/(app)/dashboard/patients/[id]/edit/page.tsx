// src/app/(app)/dashboard/patients/[id]/edit/page.tsx
import { notFound } from "next/navigation"
import { requireRole } from "@/lib/supabase/profile"
import { getPatient } from "@/features/patients/actions"
import { listDoctors } from "@/features/appointments/actions"
import PatientForm from "@/features/patients/patient-form"

export const metadata = { title: "Edit Patient" }

export default async function EditPatientPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const profile = await requireRole("doctor", "staff")
  const [patientResult, doctorsResult] = await Promise.all([
    getPatient(id),
    listDoctors(),
  ])

  if (!patientResult.success) notFound()

  const doctorOptions = doctorsResult.success ? doctorsResult.data : []

  return (
    <PatientForm
      mode="edit"
      patient={patientResult.data}
      role={profile.role}
      doctorOptions={doctorOptions}
    />
  )
}