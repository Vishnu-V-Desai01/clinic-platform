import { Calendar } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { EmptyState } from '@/components/empty-state'

export default function AppointmentsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Appointments" />
      <EmptyState
        icon={Calendar}
        title="Appointments feature coming soon"
        description="This page will be built in the Appointments feature chat."
      />
    </div>
  )
}