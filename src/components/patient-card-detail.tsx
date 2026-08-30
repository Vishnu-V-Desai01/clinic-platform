'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ChevronLeft,
  FileText,
  CalendarX,
  Wallet,
  ClipboardList,
  Download,
} from 'lucide-react'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card } from '@/components/ui/card'
import type { PortalCardDetail } from '@/features/portal/types'
import { calculateAge } from '@/features/patients/types'

// ─────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────

const formatINR = (rupees: number): string => {
  return `₹${Number(rupees).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

const formatDate = (isoString: string): string => {
  try {
    const date = new Date(isoString)
    return new Intl.DateTimeFormat('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(date)
  } catch {
    return isoString
  }
}

// Builds the receipt download URL for a payment.
const getReceiptHref = (paymentId: string): string => {
  const segments = ['', 'api', 'payments', paymentId, 'receipt']
  return segments.join('/')
}

// Opens the receipt PDF in a new tab. Deliberately NOT a literal <a> tag —
// three prior attempts using an anchor element all failed to survive
// copy-paste intact, with the opening "<a" token itself vanishing while
// every attribute and the closing "</a>" remained, producing cascading
// JSX parse errors. A native <button> with window.open() achieves the
// same "open in new tab" behavior without emitting that token at all.
const openReceipt = (paymentId: string) => {
  const href = getReceiptHref(paymentId)
  window.open(href, '_blank', 'noopener,noreferrer')
}

const getBadgeClassesBySeverity = (severity: string): string => {
  const map: Record<string, string> = {
    mild: 'bg-sky-500/15 text-sky-700 dark:text-sky-400',
    moderate: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
    severe: 'bg-destructive/15 text-destructive',
  }
  return map[severity] || 'bg-muted text-muted-foreground'
}

const getBadgeClassesByAppointmentStatus = (status: string): string => {
  const map: Record<string, string> = {
    scheduled: 'bg-sky-500/15 text-sky-700 dark:text-sky-400',
    completed: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
    cancelled: 'bg-muted text-muted-foreground',
    'no-show': 'bg-destructive/15 text-destructive',
  }
  return map[status] || 'bg-muted text-muted-foreground'
}

const getBadgeClassesByPaymentStatus = (status: string): string => {
  const map: Record<string, string> = {
    paid: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
    partial: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
    unpaid: 'bg-destructive/15 text-destructive',
  }
  return map[status] || 'bg-muted text-muted-foreground'
}

const getBadgeClassesByPriority = (priority: string): string => {
  const map: Record<string, string> = {
    Low: 'bg-sky-500/15 text-sky-700 dark:text-sky-400',
    Medium: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
    High: 'bg-destructive/15 text-destructive',
  }
  return map[priority] || 'bg-muted text-muted-foreground'
}

const getBadgeClassesByFollowUpStatus = (status: string): string => {
  const map: Record<string, string> = {
    Pending: 'bg-sky-500/15 text-sky-700 dark:text-sky-400',
    Completed: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  }
  return map[status] || 'bg-muted text-muted-foreground'
}

// ─────────────────────────────────────────────────────────────────────────
// TAB CONTENTS
// ─────────────────────────────────────────────────────────────────────────

const RecordsTabContent = ({
  encounters,
}: {
  encounters: PortalCardDetail['encounters']
}) => {
  if (!encounters || encounters.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12">
        <FileText className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
        <p className="text-muted-foreground">No medical records yet</p>
      </div>
    )
  }

  const sortedEncounters = [...encounters].sort(
    (a, b) => new Date(b.encounterDate).getTime() - new Date(a.encounterDate).getTime()
  )

  return (
    <div className="space-y-4">
      {/* Item 3b: caption clarifying that treatment detail depth is
          doctor-dependent, not a system limitation. Sits above the
          accordion, applies to every encounter in this tab. */}
      <p className="text-xs text-muted-foreground">
        Details below are entered by your treating doctor and may not include every minor detail from your visit.
      </p>
      <Accordion type="single" collapsible className="w-full">
        {sortedEncounters.map((encounter) => (
          <AccordionItem key={encounter.id} value={encounter.id}>
            <AccordionTrigger className="hover:no-underline">
              <div className="flex flex-col items-start gap-1 text-left">
                <span className="font-semibold text-foreground">
                  {formatDate(encounter.encounterDate)}
                </span>
                <span className="text-sm text-muted-foreground">
                  {encounter.chiefComplaint || 'Consultation'}
                </span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="space-y-6">
              {encounter.diagnoses && encounter.diagnoses.length > 0 && (
                <div>
                  <h4 className="text-xs font-medium uppercase text-muted-foreground mb-3">
                    Diagnoses
                  </h4>
                  <div className="space-y-2">
                    {encounter.diagnoses.map((diag) => (
                      <div key={diag.id} className="flex items-center justify-between">
                        <span className="text-foreground">{diag.conditionName}</span>
                        {diag.severity && (
                          <Badge
                            variant="outline"
                            className={getBadgeClassesBySeverity(diag.severity)}
                          >
                            {diag.severity.charAt(0).toUpperCase() + diag.severity.slice(1)}
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {encounter.observations && encounter.observations.length > 0 && (
                <div>
                  <h4 className="text-xs font-medium uppercase text-muted-foreground mb-3">
                    Observations
                  </h4>
                  <div className="space-y-1">
                    {encounter.observations.map((obs) => (
                      <p key={obs.id} className="text-foreground text-sm">
                        {obs.observationType} — {obs.value} {obs.unit}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              {encounter.prescriptions && encounter.prescriptions.length > 0 && (
                <div>
                  <h4 className="text-xs font-medium uppercase text-muted-foreground mb-3">
                    Prescriptions
                  </h4>
                  <div className="space-y-1">
                    {encounter.prescriptions.map((pres) => (
                      <p key={pres.id} className="text-foreground text-sm">
                        {pres.medicineName} — {pres.dosage} · {pres.frequency} ·{' '}
                        {pres.duration}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              {encounter.testResults && encounter.testResults.length > 0 && (
                <div>
                  <h4 className="text-xs font-medium uppercase text-muted-foreground mb-3">
                    Test Results
                  </h4>
                  <div className="space-y-2">
                    {encounter.testResults.map((test) => (
                      <div key={test.id} className="flex items-center justify-between">
                        <span className="text-foreground text-sm">
                          {test.testName} — {test.resultValue}
                        </span>
                        {test.isAbnormal && (
                          <Badge
                            variant="outline"
                            className="bg-destructive/15 text-destructive"
                          >
                            Abnormal
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  )
}

const AppointmentsTabContent = ({
  appointments,
}: {
  appointments: PortalCardDetail['appointments']
}) => {
  if (!appointments || appointments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12">
        <CalendarX className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
        <p className="text-muted-foreground">No appointments scheduled</p>
      </div>
    )
  }

  const sortedAppointments = [...appointments].sort(
    (a, b) => new Date(b.appointmentDate).getTime() - new Date(a.appointmentDate).getTime()
  )

  return (
    <>
      <div className="sm:hidden space-y-3">
        {sortedAppointments.map((apt) => (
          <Card key={apt.id} className="p-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-foreground">
                  {formatDate(apt.appointmentDate)}
                </span>
                <Badge
                  variant="outline"
                  className={getBadgeClassesByAppointmentStatus(apt.status)}
                >
                  {apt.status.charAt(0).toUpperCase() + apt.status.slice(1).replace('-', ' ')}
                </Badge>
              </div>
              {apt.notes && (
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {apt.notes}
                </p>
              )}
            </div>
          </Card>
        ))}
      </div>

      <div className="hidden sm:block overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedAppointments.map((apt) => (
              <TableRow key={apt.id}>
                <TableCell className="font-semibold">
                  {formatDate(apt.appointmentDate)}
                </TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={getBadgeClassesByAppointmentStatus(apt.status)}
                  >
                    {apt.status.charAt(0).toUpperCase() + apt.status.slice(1).replace('-', ' ')}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground truncate max-w-xs">
                  {apt.notes || '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  )
}

const PaymentsTabContent = ({
  payments,
}: {
  payments: PortalCardDetail['payments']
}) => {
  if (!payments || payments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12">
        <Wallet className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
        <p className="text-muted-foreground">No payments recorded</p>
      </div>
    )
  }

  const sortedPayments = [...payments].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )

  const totalOutstanding = sortedPayments.reduce(
    (sum, p) => sum + p.outstandingBalance,
    0
  )

  const outstandingClasses =
    totalOutstanding > 0
      ? 'bg-amber-500/15 border-amber-200 dark:border-amber-900'
      : 'bg-muted border-border'

  return (
    <div className="space-y-6">
      <Card className={`p-6 border ${outstandingClasses}`}>
        <p className="text-sm font-medium text-muted-foreground mb-2">
          Outstanding Balance
        </p>
        <p
          className={`text-3xl font-bold ${
            totalOutstanding > 0
              ? 'text-amber-700 dark:text-amber-400'
              : 'text-muted-foreground'
          }`}
        >
          {formatINR(totalOutstanding)}
        </p>
      </Card>

      {/* Mobile: Stacked Cards */}
      <div className="sm:hidden space-y-3">
        {sortedPayments.map((pay) => (
          <Card key={pay.id} className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                {formatDate(pay.createdAt)}
              </span>
              <Badge
                variant="outline"
                className={getBadgeClassesByPaymentStatus(pay.paymentStatus)}
              >
                {pay.paymentStatus.charAt(0).toUpperCase() + pay.paymentStatus.slice(1)}
              </Badge>
            </div>
            <div className="grid grid-cols-3 gap-2 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Charged</p>
                <p className="font-semibold text-foreground">
                  {formatINR(pay.amountCharged)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Paid</p>
                <p className="font-semibold text-foreground">
                  {formatINR(pay.amountPaid)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Outstanding</p>
                <p className="font-semibold text-foreground">
                  {formatINR(pay.outstandingBalance)}
                </p>
              </div>
            </div>
            {pay.approvalStatus === 'approved' && (
              <button
                type="button"
                onClick={() => openReceipt(pay.id)}
                className="flex w-full items-center justify-center gap-1.5 rounded-md border border-border py-2 text-xs font-medium text-primary hover:bg-muted transition-colors"
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                Download Receipt
              </button>
            )}
          </Card>
        ))}
      </div>

      {/* Desktop: Table */}
      <div className="hidden sm:block overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Amount Charged</TableHead>
              <TableHead className="text-right">Amount Paid</TableHead>
              <TableHead className="text-right">Outstanding</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Receipt</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedPayments.map((pay) => (
              <TableRow key={pay.id}>
                <TableCell className="font-semibold">
                  {formatDate(pay.createdAt)}
                </TableCell>
                <TableCell className="text-right text-foreground">
                  {formatINR(pay.amountCharged)}
                </TableCell>
                <TableCell className="text-right text-foreground">
                  {formatINR(pay.amountPaid)}
                </TableCell>
                <TableCell className="text-right font-semibold text-foreground">
                  {formatINR(pay.outstandingBalance)}
                </TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={getBadgeClassesByPaymentStatus(pay.paymentStatus)}
                  >
                    {pay.paymentStatus.charAt(0).toUpperCase() +
                      pay.paymentStatus.slice(1)}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  {pay.approvalStatus === 'approved' ? (
                    <button
                      type="button"
                      onClick={() => openReceipt(pay.id)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                      aria-label="Download payment receipt"
                    >
                      <Download className="h-3.5 w-3.5" aria-hidden="true" />
                      Download
                    </button>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

const CarePlanTabContent = ({
  carePlan,
}: {
  carePlan: PortalCardDetail['carePlan']
}) => {
  if (!carePlan) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12">
        <ClipboardList className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
        <p className="text-muted-foreground">No active care plan</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {carePlan.medicines && carePlan.medicines.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-4">Medicines</h3>
          <div className="space-y-2">
            {carePlan.medicines.map((med) => (
              <p key={med.id} className="text-foreground text-sm">
                {med.medicineName} — {med.strength} · {med.frequency} ·{' '}
                {med.durationValue} {med.durationUnit}
              </p>
            ))}
          </div>
        </div>
      )}

      {carePlan.followUps && carePlan.followUps.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-4">Follow-ups</h3>
          <div className="space-y-3">
            {carePlan.followUps.map((fu) => (
              <Card key={fu.id} className="p-4">
                <div className="space-y-2">
                  <p className="text-foreground text-sm font-medium">{fu.description}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    {fu.scheduledDate && (
                      <span className="text-xs text-muted-foreground">
                        {formatDate(fu.scheduledDate)}
                      </span>
                    )}
                    {fu.priority && (
                      <Badge
                        variant="outline"
                        className={getBadgeClassesByPriority(fu.priority)}
                      >
                        {fu.priority}
                      </Badge>
                    )}
                    <Badge
                      variant="outline"
                      className={getBadgeClassesByFollowUpStatus(fu.status)}
                    >
                      {fu.status}
                    </Badge>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {carePlan.suggestions && carePlan.suggestions.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-4">Suggestions</h3>
          <div className="space-y-3">
            {carePlan.suggestions.map((sug) => (
              <Card key={sug.id} className="p-4">
                <div className="space-y-2">
                  <p className="text-foreground text-sm">{sug.suggestionText}</p>
                  {sug.category && (
                    <Badge variant="secondary" className="w-fit">
                      {sug.category}
                    </Badge>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────

interface PatientCardDetailProps {
  cardDetail: PortalCardDetail
}

export default function PatientCardDetail({ cardDetail }: PatientCardDetailProps) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<'records' | 'appointments' | 'payments' | 'care-plan'>('records')

  const fullName = `${cardDetail.firstName} ${cardDetail.lastName}`
  const age = calculateAge(cardDetail.dateOfBirth)

  const hasEmergencyContact =
    cardDetail.emergencyContactName ||
    cardDetail.emergencyContactPhone ||
    cardDetail.emergencyContactRelationship

  const hasAddress =
    cardDetail.address || cardDetail.city || cardDetail.state || cardDetail.postalCode

  const handleBack = () => {
    router.push('/portal')
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-3xl px-4 py-6 space-y-6">
        {/* Header */}
        <div className="space-y-4">
          <div className="flex items-center gap-3 mb-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleBack}
              aria-label="Back to portal"
              className="rounded-lg hover:bg-muted"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-lg font-semibold text-primary">{cardDetail.clinicName}</h1>
          </div>

          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">{fullName}</p>
            <p className="text-xs text-muted-foreground">
              {cardDetail.mrn && `MRN ${cardDetail.mrn}`}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {cardDetail.bloodGroup && (
              <Badge variant="secondary" className="text-xs">
                {cardDetail.bloodGroup}
              </Badge>
            )}
            {cardDetail.allergies &&
              cardDetail.allergies.map((allergy) => (
                <Badge key={allergy} variant="outline" className="text-xs">
                  Allergy: {allergy}
                </Badge>
              ))}
            {cardDetail.conditions &&
              cardDetail.conditions.map((condition) => (
                <Badge key={condition} variant="outline" className="text-xs">
                  {condition}
                </Badge>
              ))}
          </div>
        </div>

        {/* Personal & Contact Information */}
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">
            Personal & Contact Information
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
            {cardDetail.dateOfBirth && (
              <div>
                <p className="text-xs text-muted-foreground">Date of Birth</p>
                <p className="text-foreground">
                  {formatDate(cardDetail.dateOfBirth)}
                  {age !== null && ` (${age} yrs)`}
                </p>
              </div>
            )}
            {cardDetail.gender && (
              <div>
                <p className="text-xs text-muted-foreground">Gender</p>
                <p className="text-foreground capitalize">
                  {cardDetail.gender.replace('_', ' ')}
                </p>
              </div>
            )}
            {cardDetail.phone && (
              <div>
                <p className="text-xs text-muted-foreground">Phone</p>
                <p className="text-foreground">{cardDetail.phone}</p>
              </div>
            )}
            {cardDetail.email && (
              <div>
                <p className="text-xs text-muted-foreground">Email</p>
                <p className="text-foreground">{cardDetail.email}</p>
              </div>
            )}
            {hasAddress && (
              <div className="sm:col-span-2">
                <p className="text-xs text-muted-foreground">Address</p>
                <p className="text-foreground">
                  {[cardDetail.address, cardDetail.city, cardDetail.state, cardDetail.postalCode]
                    .filter(Boolean)
                    .join(', ')}
                </p>
              </div>
            )}
            {cardDetail.languagePreference && (
              <div>
                <p className="text-xs text-muted-foreground">Preferred Language</p>
                <p className="text-foreground capitalize">{cardDetail.languagePreference}</p>
              </div>
            )}
            <div>
              <p className="text-xs text-muted-foreground">Status</p>
              <Badge variant="outline" className="mt-0.5 capitalize">
                {cardDetail.status}
              </Badge>
            </div>
          </div>
        </Card>

        {/* Emergency Contact — only rendered if at least one field is present */}
        {hasEmergencyContact && (
          <Card className="p-5">
            <h2 className="text-sm font-semibold text-foreground mb-4">Emergency Contact</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-3 text-sm">
              {cardDetail.emergencyContactName && (
                <div>
                  <p className="text-xs text-muted-foreground">Name</p>
                  <p className="text-foreground">{cardDetail.emergencyContactName}</p>
                </div>
              )}
              {cardDetail.emergencyContactPhone && (
                <div>
                  <p className="text-xs text-muted-foreground">Phone</p>
                  <p className="text-foreground">{cardDetail.emergencyContactPhone}</p>
                </div>
              )}
              {cardDetail.emergencyContactRelationship && (
                <div>
                  <p className="text-xs text-muted-foreground">Relationship</p>
                  <p className="text-foreground capitalize">
                    {cardDetail.emergencyContactRelationship}
                  </p>
                </div>
              )}
            </div>
          </Card>
        )}

        {/* Tabs */}
        <Tabs
          value={activeTab}
          onValueChange={(value) =>
            setActiveTab(value as 'records' | 'appointments' | 'payments' | 'care-plan')
          }
          className="w-full"
        >
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="records" aria-label="View medical records" className="text-xs sm:text-sm">
              Records
            </TabsTrigger>
            <TabsTrigger value="appointments" aria-label="View appointments" className="text-xs sm:text-sm">
              Appointments
            </TabsTrigger>
            <TabsTrigger value="payments" aria-label="View payments" className="text-xs sm:text-sm">
              Payments
            </TabsTrigger>
            <TabsTrigger value="care-plan" aria-label="View care plan" className="text-xs sm:text-sm">
              Care Plan
            </TabsTrigger>
          </TabsList>

          <TabsContent value="records" className="mt-6">
            <RecordsTabContent encounters={cardDetail.encounters} />
          </TabsContent>

          <TabsContent value="appointments" className="mt-6">
            <AppointmentsTabContent appointments={cardDetail.appointments} />
          </TabsContent>

          <TabsContent value="payments" className="mt-6">
            <PaymentsTabContent payments={cardDetail.payments} />
          </TabsContent>

          <TabsContent value="care-plan" className="mt-6">
            <CarePlanTabContent carePlan={cardDetail.carePlan} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}