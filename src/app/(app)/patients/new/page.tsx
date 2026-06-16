import PatientForm from "@/features/patients/patient-form"

export const metadata = { title: "Register New Patient" }

export default function NewPatientPage() {
  return <PatientForm mode="create" />
}