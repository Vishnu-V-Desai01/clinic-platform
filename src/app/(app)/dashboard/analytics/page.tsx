// src/app/(app)/dashboard/analytics/page.tsx

import { requireRole } from '@/lib/supabase/profile'
import AnalyticsDashboardContainer from '@/features/analytics/components/analytics-dashboard-container'

export const metadata = { title: 'Analytics Dashboard' }

export default async function AnalyticsPage() {
  await requireRole('doctor')
  return <AnalyticsDashboardContainer />
}