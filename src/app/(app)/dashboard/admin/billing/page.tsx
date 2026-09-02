import { createServerSupabaseClient } from '@/lib/supabase/server'
import AdminBillingSettings from '@/features/billing/components/AdminBillingSettings'
import { redirect } from 'next/navigation'

export const metadata = {
  title: 'Billing & Subscriptions',
}

export default async function BillingPage() {
  const supabase = createServerSupabaseClient()

  // Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/sign-in')
  }

  // Get user's profile and clinic
  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id')
    .eq('clerk_user_id', user.id)
    .single()

  if (!profile?.clinic_id) {
    redirect('/onboarding')
  }

  // Get clinic subscription data
  const { data: clinic } = await supabase
    .from('clinics')
    .select(
      'id, subscription_status, subscription_tier, subscription_term, trial_ends_at, current_period_end'
    )
    .eq('id', profile.clinic_id)
    .single()

  if (!clinic) {
    redirect('/onboarding')
  }

  // Get invoices
  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, issued_at, description, amount_paise, status')
    .eq('clinic_id', profile.clinic_id)
    .order('issued_at', { ascending: false })
    .limit(10)

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Billing & Subscriptions
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your subscription, view invoices, and update billing details.
        </p>
      </div>

      <AdminBillingSettings
        subscription={{
          tier: (clinic.subscription_tier || 'clinic') as any,
          term: (clinic.subscription_term || '1yr') as any,
          status: (clinic.subscription_status || 'trialing') as any,
          trialEndsAt: clinic.trial_ends_at,
          renewsAt: clinic.current_period_end,
          dueAt: undefined,
        }}
        invoices={
          invoices?.map((inv) => ({
            id: inv.id,
            date: inv.issued_at,
            description: inv.description || 'Subscription payment',
            amountPaise: inv.amount_paise,
            status: 'paid' as const,
          })) || []
        }
      />
    </div>
  )
}