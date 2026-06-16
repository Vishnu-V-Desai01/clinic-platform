import { ClipboardList } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { EmptyState } from '@/components/empty-state'

export default function CarePlansPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Care plans" />
      <EmptyState
        icon={ClipboardList}
        title="Care plans feature coming soon"
        description="This page will be built in the Care Plans feature chat."
      />
    </div>
  )
}