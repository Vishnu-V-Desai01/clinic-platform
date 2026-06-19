import Link from "next/link"
import { notFound } from "next/navigation"
import { FileText } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
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

      {/* Medical Records navigation */}
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
            <Link href={`/patients/${id}/records`}>View Records</Link>
          </Button>
        </CardContent>
      </Card>

      <ConsentSection patientId={id} />
    </div>
  )
}