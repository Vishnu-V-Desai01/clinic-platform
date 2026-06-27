// src/app/(app)/dashboard/patients/[id]/page.tsx

import Link from "next/link"
import { notFound } from "next/navigation"
import { FileText, CreditCard } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getPatient } from "@/features/patients/actions"
import PatientProfile from "@/features/patients/patient-profile"
import ConsentSection from "@/features/consent/components/ConsentSection"
import { getEncountersForPatient } from "@/features/medical-records/actions"
import { listAppointments } from "@/features/appointments/actions"
import PatientPaymentSummary from "@/features/payments/components/patient-payment-summary"

export const metadata = { title: "Patient Profile" }

export default async function PatientPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const result = await getPatient(id)
  if (!result.success) notFound()

  const [encountersResult, appointmentsResult] = await Promise.all([
    getEncountersForPatient(id),
    listAppointments({ patientId: id }),
  ])

  const recentEncounters =
    "data" in encountersResult ? encountersResult.data.slice(0, 5) : []
  const recentAppointments = appointmentsResult.success
    ? appointmentsResult.data.slice(0, 5)
    : []

  return (
    <div className="space-y-6">
      <PatientProfile
        patient={result.data}
        recentEncounters={recentEncounters}
        recentAppointments={recentAppointments}
      />

      {/* Medical Records quick access */}
      <Card>
        <CardContent className="flex items-center justify-between py-4">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
              <FileText className="size-5" />
            </div>
            <div>
              <p className="font-medium text-foreground">Medical Records</p>
              <p className="text-sm text-muted-foreground">
                Encounters, diagnoses, vitals, prescriptions and test results
              </p>
            </div>
          </div>
          <Button asChild variant="outline">
            <Link href={`/dashboard/patients/${id}/records`}>View Records</Link>
          </Button>
        </CardContent>
      </Card>

      {/* Payment Summary */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
              <CreditCard className="size-5" />
            </div>
            <CardTitle className="text-base font-semibold">
              Payment Summary
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <PatientPaymentSummary patientId={id} />
        </CardContent>
      </Card>

      <ConsentSection patientId={id} />
    </div>
  )
}