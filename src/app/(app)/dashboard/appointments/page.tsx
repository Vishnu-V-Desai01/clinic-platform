import { listAppointments, listDoctors } from "@/features/appointments/actions"
import { listPatients } from "@/features/patients/actions"
import { requireRole } from "@/lib/supabase/profile"
import AppointmentsList from "@/features/appointments/components/appointments-list"

export default async function AppointmentsPage() {
  const profile = await requireRole("doctor", "staff")

  const [appointmentsResult, patientsResult, doctorsResult] = await Promise.all([
    listAppointments(),
    listPatients(),
    listDoctors(),
  ])

  const appointments = appointmentsResult.success ? appointmentsResult.data : []
  const doctors      = doctorsResult.success      ? doctorsResult.data      : []

  // Transform PatientListItem → PatientOption for the booking form
  const patients = patientsResult.success
    ? patientsResult.data.map((p) => ({
        id:   p.id,
        name: `${p.firstName} ${p.lastName}`,
        mrn:  p.mrn,
      }))
    : []

  return (
    <AppointmentsList
      appointments={appointments}
      patients={patients}
      doctors={doctors}
    />
  )
}