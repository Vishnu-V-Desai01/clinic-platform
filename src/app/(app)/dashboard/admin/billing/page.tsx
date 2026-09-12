import { createServerSupabaseClient } from '@/lib/supabase/server'
import { currentUser } from '@clerk/nextjs/server'
import AdminBillingSettings from '@/features/billing/components/AdminBillingSettings'
import { redirect } from 'next/navigation'
import type { SubscriptionTier, SubscriptionTerm } from '@/features/billing/types'

export const dynamic = 'force-dynamic'

export default async function BillingPage() {
  const user = await currentUser()

  if (!user) {
    redirect('/sign-in')
  }

  const supabase = createServerSupabaseClient()

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id')
    .eq('clerk_user_id', user.id)
    .single()

  if (!profile?.clinic_id) {
    redirect('/onboarding')
  }

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

  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, issued_at, description, amount_paise, status')
    .eq('clinic_id', profile.clinic_id)
    .order('issued_at', { ascending: false })
    .limit(10)

  // Doctors currently on staff — mirrors the server-side checks in
  // createCheckoutOrderAction / purchaseSeatAddonAction, here just for
  // display/UX (disabling tier cards that no longer fit, etc).
  const { count: doctorCount } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('clinic_id', profile.clinic_id)
    .eq('role', 'doctor')
    .in('status', ['active', 'suspended'])

  // Add-on seats already purchased and active for the current term. Only
  // meaningful once the clinic has an active (paid) subscription — during
  // trial this is always 0, since seat add-ons require an active plan.
  const { data: activeAddonSeats } = await supabase.rpc('get_active_addon_seats', {
    p_clinic_id: profile.clinic_id,
  })

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
          tier: (clinic.subscription_tier || 'clinic') as SubscriptionTier,
          term: (clinic.subscription_term || '1yr') as SubscriptionTerm,
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
        currentDoctorCount={doctorCount ?? 0}
        activeAddonSeats={activeAddonSeats ?? 0}
      />
    </div>
  )
}