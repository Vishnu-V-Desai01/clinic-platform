// src/app/(app)/dashboard/analytics/page.tsx

import { requireRole } from '@/lib/supabase/profile'
import AnalyticsDashboardContainer from '@/features/analytics/components/analytics-dashboard-container'
import { getAnalyticsDashboardBundle } from '@/features/analytics/actions'
import type { DateRangeFilterInput } from '@/features/analytics/schema'

export const metadata = { title: 'Analytics Dashboard' }

const INITIAL_FILTER: DateRangeFilterInput = { preset: 'this_month' }

export default async function AnalyticsPage() {
  await requireRole('doctor')

  // In-process server-to-server call -- no client network round trip.
  // This is why the first paint needs zero client-side fetches for data.
  const initialData = await getAnalyticsDashboardBundle(INITIAL_FILTER)

  return (
    <AnalyticsDashboardContainer initialData={initialData} initialFilter={INITIAL_FILTER} />
  )
}