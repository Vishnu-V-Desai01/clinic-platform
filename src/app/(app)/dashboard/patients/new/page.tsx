// src/app/(app)/dashboard/patients/new/page.tsx
import { requireRole } from "@/lib/supabase/profile"
import { listDoctors } from "@/features/appointments/actions"
import PatientForm from "@/features/patients/patient-form"

export const metadata = { title: "Register New Patient" }

export default async function NewPatientPage() {
  const profile = await requireRole("doctor", "staff")
  const doctorsResult = await listDoctors()
  const doctorOptions = doctorsResult.success ? doctorsResult.data : []

  return (
    <PatientForm mode="create" role={profile.role} doctorOptions={doctorOptions} />
  )
}