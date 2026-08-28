import { requireAdmin } from '@/lib/supabase/profile'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Gates every current and future page under /dashboard/admin/*. A
  // non-admin doctor or staff member is redirected before any child page
  // or its data-fetching runs — individual pages/actions may still check
  // is_clinic_admin themselves for defence in depth, but this is the
  // backstop that doesn't depend on anyone remembering to add it.
  await requireAdmin()

  return <>{children}</>
}