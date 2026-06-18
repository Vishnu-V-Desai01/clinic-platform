import { notFound } from "next/navigation"

import { requireRole } from "@/lib/supabase/profile"
import { getAppointmentById } from "@/features/appointments/actions"
import AppointmentDetailView from "@/features/appointments/components/appointment-detail"

export default async function AppointmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const profile = await requireRole("doctor", "staff")

  const result = await getAppointmentById(id)

  if (!result.success) notFound()

  return (
    <AppointmentDetailView
      appointment={result.data}
      userRole={profile.role as "doctor" | "staff"}
    />
  )
}