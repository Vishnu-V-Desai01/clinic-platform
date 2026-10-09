'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/supabase/profile'
import {
<<<<<<< HEAD
=======
  canPurchaseAddonSeats,
>>>>>>> cc8f172 (feat(billing): cap add-on seats at 2 per tier, block checkout when subscription already active)
  computePrice,
  computeSeatAddonPriceForNewTerm,
  computeSeatAddonProratedPrice,
  fitsEffectiveDoctorCount,
<<<<<<< HEAD
=======
  getMaxAddonSeats,
>>>>>>> cc8f172 (feat(billing): cap add-on seats at 2 per tier, block checkout when subscription already active)
  seatAddonSupported,
} from './pricing'
import { razorpay } from './razorpay'
import type { SubscriptionTier, SubscriptionTerm } from './types'

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }

export interface CheckoutOrderData {
  orderId: string
  amount: number
  currency: string
  keyId: string
}

/**
 * Creates a Razorpay order for a clinic's fresh subscription checkout,
 * optionally including add-on seats purchased for the same term.
 *
<<<<<<< HEAD
 * Flow:
 * 1. Verify caller is a clinic admin
 * 2. Compute the exact tier price + (if requested) add-on seat price —
 *    both server-side, never trusting a client-supplied amount
 * 3. Check the clinic's current doctor count fits the tier + add-on seats
 * 4. Create ONE Razorpay order for the combined total
 * 5. Insert a pending `subscriptions` row for the base tier
 * 6. If addonSeats > 0, insert a pending `subscription_seat_addons` row
 *    referencing that subscription, sharing the same razorpay_order_id
 * 7. Return order details so the client can open Razorpay checkout
 *
 * Both rows stay 'pending' until the webhook confirms payment.
=======
 * Blocks checkout entirely if the clinic already has an ACTIVE paid
 * subscription — a second checkout while one is already active would
 * create a competing subscription row with no relationship to the
 * existing one, risking a double payment. A clinic wanting to change
 * plans mid-term should be routed to support, not self-serve checkout,
 * until a proper upgrade/downgrade flow exists.
>>>>>>> cc8f172 (feat(billing): cap add-on seats at 2 per tier, block checkout when subscription already active)
 */
export async function createCheckoutOrderAction(
  tier: SubscriptionTier,
  term: SubscriptionTerm,
  addonSeats: number = 0
): Promise<ActionResult<CheckoutOrderData>> {
  try {
    const admin = await requireAdmin()

    if (!admin.clinic_id) {
      return { success: false, error: 'Clinic not found' }
    }

<<<<<<< HEAD
=======
    const supabase = createServerSupabaseClient()

    const { data: existingActive, error: activeCheckError } = await supabase
      .from('subscriptions')
      .select('id')
      .eq('clinic_id', admin.clinic_id)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle()

    if (activeCheckError) {
      console.error('[createCheckoutOrderAction] active subscription check failed:', activeCheckError)
      return { success: false, error: 'Could not verify subscription status' }
    }

    if (existingActive) {
      return {
        success: false,
        error:
          'Your clinic already has an active subscription. To change plans, contact support — self-serve plan changes mid-term are not yet available.',
      }
    }

>>>>>>> cc8f172 (feat(billing): cap add-on seats at 2 per tier, block checkout when subscription already active)
    const quote = computePrice(tier, term)

    if (quote.kind !== 'priced') {
      return { success: false, error: 'Enterprise tier requires manual sales process' }
    }

    const normalizedAddonSeats = seatAddonSupported(quote.tier) ? Math.max(0, addonSeats) : 0

<<<<<<< HEAD
    const supabase = createServerSupabaseClient()
=======
    // Fresh checkout — no seats exist yet for this new term, so the
    // "existing" side of the cap check is always 0 here.
    if (normalizedAddonSeats > 0 && !canPurchaseAddonSeats(quote.tier, 0, normalizedAddonSeats)) {
      const max = getMaxAddonSeats(quote.tier)
      return {
        success: false,
        error: `This plan allows at most ${max} add-on seat${max === 1 ? '' : 's'}.`,
      }
    }
>>>>>>> cc8f172 (feat(billing): cap add-on seats at 2 per tier, block checkout when subscription already active)

    const { data: doctorCount, error: doctorCountError } = await supabase.rpc(
      'count_clinic_doctors',
      { p_clinic_id: admin.clinic_id }
    )

    if (doctorCountError) {
      console.error('[createCheckoutOrderAction] doctor count lookup failed:', doctorCountError)
      return { success: false, error: 'Could not verify doctor count' }
    }

    if (!fitsEffectiveDoctorCount(quote.tier, normalizedAddonSeats, doctorCount ?? 0)) {
      return {
        success: false,
        error: `This plan (with the selected add-on seats) supports fewer doctors than your clinic currently has (${doctorCount}). Choose a higher tier or more seats.`,
      }
    }

    const addonPaise = computeSeatAddonPriceForNewTerm(quote.tier, term, normalizedAddonSeats)
    const totalPaise = quote.totalPaise + addonPaise

    const order = await razorpay.orders.create({
      amount: totalPaise,
      currency: 'INR',
      receipt: `clinic-${admin.clinic_id.slice(0, 8)}-${Date.now()}`,
    })

    if (!order.id) {
      return { success: false, error: 'Failed to create payment order' }
    }

    const { data: newSubscription, error: subscriptionError } = await supabase
      .from('subscriptions')
      .insert({
        clinic_id: admin.clinic_id,
        razorpay_order_id: order.id,
        tier: quote.tier,
        term: quote.term,
        status: 'pending',
        amount_paise: quote.totalPaise,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (subscriptionError || !newSubscription) {
      console.error('[createCheckoutOrderAction] subscription insert failed:', subscriptionError)
      return { success: false, error: 'Failed to record subscription' }
    }

    if (normalizedAddonSeats > 0) {
      const { error: addonError } = await supabase.from('subscription_seat_addons').insert({
        subscription_id: newSubscription.id,
        clinic_id: admin.clinic_id,
        razorpay_order_id: order.id,
        seats: normalizedAddonSeats,
        amount_paise: addonPaise,
        status: 'pending',
      })

      if (addonError) {
<<<<<<< HEAD
        // Not fatal to checkout itself — the webhook will still activate
        // the base subscription. Logged for manual reconciliation since
        // the clinic paid for seats that won't get recorded.
=======
>>>>>>> cc8f172 (feat(billing): cap add-on seats at 2 per tier, block checkout when subscription already active)
        console.error('[createCheckoutOrderAction] seat addon insert failed:', addonError)
      }
    }

    return {
      success: true,
      data: {
        orderId: order.id,
        amount: totalPaise,
        currency: 'INR',
        keyId: process.env.RAZORPAY_KEY_ID!,
      },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create checkout order'
    console.error('[createCheckoutOrderAction] error:', err)
    return { success: false, error: message }
  }
}

/**
 * Creates a Razorpay order for buying extra doctor seats mid-subscription,
 * prorated to the days remaining in the clinic's current active term.
 *
<<<<<<< HEAD
 * Requires an existing 'active' subscription — this is not for initial
 * checkout (use createCheckoutOrderAction for that) and not available
 * during trial (trial has its own generous doctor cap).
=======
 * Caps total seats (already-active + this purchase) at the tier's max —
 * this is what stops a clinic from buying 2, then 2 more, past the cap.
>>>>>>> cc8f172 (feat(billing): cap add-on seats at 2 per tier, block checkout when subscription already active)
 */
export async function purchaseSeatAddonAction(
  seats: number
): Promise<ActionResult<CheckoutOrderData>> {
  try {
    const admin = await requireAdmin()

    if (!admin.clinic_id) {
      return { success: false, error: 'Clinic not found' }
    }

    if (seats <= 0) {
      return { success: false, error: 'Seat count must be at least 1' }
    }

    const supabase = createServerSupabaseClient()

    const { data: activeSubscription, error: subFetchError } = await supabase
      .from('subscriptions')
      .select('id, tier, ends_at, status')
      .eq('clinic_id', admin.clinic_id)
      .eq('status', 'active')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (subFetchError || !activeSubscription) {
      return {
        success: false,
        error: 'No active subscription found. Add-on seats require an active paid plan.',
      }
    }

<<<<<<< HEAD
    if (!seatAddonSupported(activeSubscription.tier as SubscriptionTier)) {
=======
    const tier = activeSubscription.tier as SubscriptionTier

    if (!seatAddonSupported(tier)) {
>>>>>>> cc8f172 (feat(billing): cap add-on seats at 2 per tier, block checkout when subscription already active)
      return {
        success: false,
        error: 'This plan does not support add-on seats. Contact sales for higher doctor counts.',
      }
    }

<<<<<<< HEAD
=======
    const { data: existingActiveSeats, error: existingSeatsError } = await supabase.rpc(
      'get_active_addon_seats',
      { p_clinic_id: admin.clinic_id }
    )

    if (existingSeatsError) {
      console.error('[purchaseSeatAddonAction] existing seat lookup failed:', existingSeatsError)
      return { success: false, error: 'Could not verify current seat count' }
    }

    if (!canPurchaseAddonSeats(tier, existingActiveSeats ?? 0, seats)) {
      const max = getMaxAddonSeats(tier)
      return {
        success: false,
        error: `This plan allows at most ${max} add-on seat${max === 1 ? '' : 's'} in total. You currently have ${existingActiveSeats ?? 0}.`,
      }
    }

>>>>>>> cc8f172 (feat(billing): cap add-on seats at 2 per tier, block checkout when subscription already active)
    if (!activeSubscription.ends_at) {
      return { success: false, error: 'Could not determine subscription term end date' }
    }

    const proratedPaise = computeSeatAddonProratedPrice(
<<<<<<< HEAD
      activeSubscription.tier as SubscriptionTier,
=======
      tier,
>>>>>>> cc8f172 (feat(billing): cap add-on seats at 2 per tier, block checkout when subscription already active)
      seats,
      new Date(activeSubscription.ends_at)
    )

    if (proratedPaise <= 0) {
      return { success: false, error: 'Subscription term has already ended' }
    }

    const order = await razorpay.orders.create({
      amount: proratedPaise,
      currency: 'INR',
      receipt: `seat-addon-${admin.clinic_id.slice(0, 8)}-${Date.now()}`,
    })

    if (!order.id) {
      return { success: false, error: 'Failed to create payment order' }
    }

    const { error: addonError } = await supabase.from('subscription_seat_addons').insert({
      subscription_id: activeSubscription.id,
      clinic_id: admin.clinic_id,
      razorpay_order_id: order.id,
      seats,
      amount_paise: proratedPaise,
      status: 'pending',
    })

    if (addonError) {
      console.error('[purchaseSeatAddonAction] seat addon insert failed:', addonError)
      return { success: false, error: 'Failed to record seat purchase' }
    }

    return {
      success: true,
      data: {
        orderId: order.id,
        amount: proratedPaise,
        currency: 'INR',
        keyId: process.env.RAZORPAY_KEY_ID!,
      },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create seat purchase order'
    console.error('[purchaseSeatAddonAction] error:', err)
    return { success: false, error: message }
  }
}