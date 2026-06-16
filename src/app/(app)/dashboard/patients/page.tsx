// src/app/(app)/patients/page.tsx
import { listPatients } from "@/features/patients/actions"
import PatientsList from "@/features/patients/patients-list"

export const metadata = { title: "Patients" }

export default async function PatientsPage() {
  const result = await listPatients()

  if (!result.success) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-sm text-destructive">{result.error}</p>
      </div>
    )
  }

  return <PatientsList patients={result.data} />
}