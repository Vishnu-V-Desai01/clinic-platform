import { MessageSquare } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { EmptyState } from '@/components/empty-state'

export default function MessagesPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Messages" />
      <EmptyState
        icon={MessageSquare}
        title="Messages feature coming soon"
        description="This page will be built in the Messages feature chat."
      />
    </div>
  )
}