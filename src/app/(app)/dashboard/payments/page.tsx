import { Receipt } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { EmptyState } from '@/components/empty-state'

export default function PaymentsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Payments" />
      <EmptyState
        icon={Receipt}
        title="Payments feature coming soon"
        description="This page will be built in the Payments feature chat."
      />
    </div>
  )
}