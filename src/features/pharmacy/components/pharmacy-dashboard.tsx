//pharmacy/components/pharmacy-dashboard.tsx
//
// Adds an "Inventory" link in the header, next to the page title. Previously
// the only path to /dashboard/pharmacy/inventory was the dispense drawer's
// "Add to catalogue" button, which only appears for a not-in-catalogue
// prescription — there was no way to just go check stock levels.

import Link from 'next/link'
import {
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  PackageCheck,
  TriangleAlert,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export interface PendingPrescription {
  id: string
  patientName: string
  doctorName: string | null
  drugName: string
  dosage: string | null
  frequency: string | null
  duration: string | null
  prescribedDate: string
  stockStatus: 'healthy' | 'low' | 'expired' | 'not_in_catalogue'
  stockOnHand: number | null
}

export interface DispensedItem {
  id: string
  patientName: string
  drugName: string
  quantity: number
  dispensedAt: string
}

export interface PharmacySummary {
  pending: number
  dispensedToday: number
  lowStock: number
  expiringSoon: number
}

export interface PharmacyDashboardProps {
  summary?: PharmacySummary
  pending?: PendingPrescription[]
  dispensedToday?: DispensedItem[]
  isLoading?: boolean
  onRowClick?: (prescription: PendingPrescription) => void
}

const defaultSummary: PharmacySummary = {
  pending: 5,
  dispensedToday: 23,
  lowStock: 3,
  expiringSoon: 2,
}

const defaultPending: PendingPrescription[] = [
  { id: 'rx-1', patientName: 'Priya Sharma', doctorName: 'Meera Iyer', drugName: 'Paracetamol 650mg', dosage: '1 tablet', frequency: 'Twice daily', duration: '5 days', prescribedDate: '2026-08-11T09:00:00+05:30', stockStatus: 'healthy', stockOnHand: 340 },
  { id: 'rx-2', patientName: 'Rajesh Kumar', doctorName: 'Arjun Mehta', drugName: 'Azithromycin 500mg', dosage: '1 tablet', frequency: 'Once daily', duration: '3 days', prescribedDate: '2026-08-11T09:15:00+05:30', stockStatus: 'low', stockOnHand: 28 },
  { id: 'rx-3', patientName: 'Anjali Nair', doctorName: 'Meera Iyer', drugName: 'Pantoprazole 40mg', dosage: '1 tablet', frequency: 'Once daily, before breakfast', duration: '14 days', prescribedDate: '2026-08-11T10:00:00+05:30', stockStatus: 'expired', stockOnHand: 210 },
  { id: 'rx-4', patientName: 'Vikram Singh', doctorName: 'Arjun Mehta', drugName: 'Cetirizine 10mg', dosage: '1 tablet', frequency: 'Once daily, at night', duration: '10 days', prescribedDate: '2026-08-11T10:30:00+05:30', stockStatus: 'healthy', stockOnHand: 500 },
  { id: 'rx-5', patientName: 'Deepa Reddy', doctorName: null, drugName: 'Amoxicillin 250mg', dosage: '1 capsule', frequency: 'Thrice daily', duration: '7 days', prescribedDate: '2026-08-11T11:00:00+05:30', stockStatus: 'not_in_catalogue', stockOnHand: null },
]

const defaultDispensed: DispensedItem[] = [
  { id: 'd-1', patientName: 'Priya Sharma', drugName: 'Paracetamol 650mg', quantity: 30, dispensedAt: '2026-08-11T09:42:00+05:30' },
  { id: 'd-2', patientName: 'Rajesh Kumar', drugName: 'Cetirizine 10mg', quantity: 30, dispensedAt: '2026-08-11T10:42:00+05:30' },
  { id: 'd-3', patientName: 'Anjali Nair', drugName: 'Paracetamol 650mg', quantity: 15, dispensedAt: '2026-08-11T09:22:00+05:30' },
  { id: 'd-4', patientName: 'Vikram Singh', drugName: 'Pantoprazole 40mg', quantity: 10, dispensedAt: '2026-08-11T09:04:00+05:30' },
]

const dateFormatter = new Intl.DateTimeFormat('en-IN', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Kolkata' })
const timeFormatter = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })

function formatDate(value: string) {
  return dateFormatter.format(new Date(value))
}

function formatTime(value: string) {
  return timeFormatter.format(new Date(value))
}

function formatDosageLine(dosage: string | null, frequency: string | null, duration: string | null) {
  const parts = [dosage, frequency, duration].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : '—'
}

function StockBadge({ prescription }: { prescription: PendingPrescription }) {
  if (prescription.stockStatus === 'not_in_catalogue') {
    return <Badge className="border-transparent bg-destructive/15 text-destructive">Not in catalogue</Badge>
  }

  if (prescription.stockStatus === 'expired') {
    return <Badge className="border-transparent bg-destructive/15 text-destructive">Expired stock</Badge>
  }

  return (
    <Badge
      className={prescription.stockStatus === 'low'
        ? 'border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-400'
        : 'border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'}
    >
      Stock: {prescription.stockOnHand}
    </Badge>
  )
}

function SummaryCard({
  label,
  value,
  icon: Icon,
  warning,
}: {
  label: string
  value: number
  icon: typeof ClipboardList
  warning?: boolean
}) {
  const isWarning = warning && value > 0
  return (
    <div className="curakin-stat-card rounded-xl p-5 transition-shadow hover:shadow-md">
      <div className="mb-2 flex items-center gap-2">
        <div className={isWarning ? 'curakin-stat-icon-amber' : 'curakin-stat-icon'}>
          <Icon className="size-4" aria-hidden="true" />
        </div>
        <p className="curakin-caption">{label}</p>
      </div>
      <span className={isWarning ? 'text-2xl font-semibold tracking-tight text-amber-700 dark:text-amber-400' : 'text-2xl font-semibold tracking-tight text-foreground'}>
        {value}
      </span>
    </div>
  )
}

export default function PharmacyDashboard({
  summary = defaultSummary,
  pending = defaultPending,
  dispensedToday = defaultDispensed,
  isLoading = false,
  onRowClick,
}: PharmacyDashboardProps) {
  const activateRow = (prescription: PendingPrescription) => onRowClick?.(prescription)

  return (
    <main className="curakin-preview mx-auto flex w-full max-w-7xl flex-col gap-8 bg-background p-4 sm:p-6 lg:p-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="curakin-h1">Pharmacy</h1>
          <p className="text-sm text-muted-foreground">Today&apos;s queue and stock status.</p>
        </div>
        <Button asChild variant="outline" className="w-full sm:w-auto">
          <Link href="/dashboard/pharmacy/inventory">Inventory</Link>
        </Button>
      </header>

      <section aria-label="Pharmacy summary" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard label="Pending prescriptions" value={summary.pending} icon={ClipboardList} />
        <SummaryCard label="Dispensed today" value={summary.dispensedToday} icon={PackageCheck} />
        <SummaryCard label="Low stock items" value={summary.lowStock} icon={TriangleAlert} warning />
        <SummaryCard label="Expiring within 30 days" value={summary.expiringSoon} icon={CalendarClock} warning />
      </section>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.36fr)] lg:items-start">
        <section aria-labelledby="pending-heading" className="flex min-w-0 flex-col gap-3">
          <div className="flex items-center justify-between gap-4">
            <h2 id="pending-heading" className="curakin-caption">Pending prescriptions</h2>
            <span className="text-sm text-muted-foreground">{summary.pending} waiting</span>
          </div>
          <div className="curakin-card-flat overflow-hidden rounded-xl">
            {isLoading ? (
              <div className="flex flex-col gap-3 p-4" aria-label="Loading prescriptions">
                {Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-10 w-full" />)}
              </div>
            ) : pending.length === 0 ? (
              <div className="flex min-h-48 flex-col items-center justify-center gap-3 p-6 text-center">
                <CheckCircle2 className="size-8 text-muted-foreground" aria-hidden="true" />
                <p className="text-sm text-muted-foreground">No prescriptions waiting</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Patient</TableHead><TableHead>Doctor</TableHead><TableHead>Drug</TableHead><TableHead>Dosage</TableHead><TableHead>Prescribed date</TableHead><TableHead className="text-right">Stock</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pending.map((prescription) => (
                      <TableRow
                        key={prescription.id}
                        role="button"
                        tabIndex={0}
                        className="cursor-pointer focus-visible:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset hover:bg-muted/50"
                        onClick={() => activateRow(prescription)}
                        onKeyDown={(event) => {
                          if ((event.key === 'Enter' || event.key === ' ') && !event.nativeEvent.isComposing && event.keyCode !== 229) {
                            event.preventDefault()
                            activateRow(prescription)
                          }
                        }}
                      >
                        <TableCell className="font-medium">{prescription.patientName}</TableCell>
                        <TableCell>{prescription.doctorName ? `Dr. ${prescription.doctorName}` : <span className="text-muted-foreground">Unassigned</span>}</TableCell>
                        <TableCell>{prescription.drugName}</TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">{formatDosageLine(prescription.dosage, prescription.frequency, prescription.duration)}</TableCell>
                        <TableCell className="whitespace-nowrap">{formatDate(prescription.prescribedDate)}</TableCell>
                        <TableCell className="text-right"><StockBadge prescription={prescription} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </section>

        <section aria-labelledby="dispensed-heading" className="flex flex-col gap-3">
          <h2 id="dispensed-heading" className="curakin-caption">Dispensed today</h2>
          <div className="curakin-card-flat rounded-xl p-5">
            <h3 className="curakin-h3 mb-3">Recent activity</h3>
            {isLoading ? (
              <div className="flex flex-col gap-3" aria-label="Loading dispensed prescriptions">
                {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-7 w-full" />)}
              </div>
            ) : dispensedToday.length === 0 ? (
              <p className="py-6 text-sm text-muted-foreground">No prescriptions dispensed yet.</p>
            ) : (
              dispensedToday.map((item) => (
                <div key={item.id} className="border-b border-border py-3 text-sm last:border-b-0">
                  <p className="leading-6 text-foreground">{item.patientName} <span className="text-muted-foreground">—</span> {item.drugName} <span className="text-muted-foreground">×{item.quantity} · {formatTime(item.dispensedAt)}</span></p>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </main>
  )
}