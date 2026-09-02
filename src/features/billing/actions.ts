'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/supabase/profile'
import { computePrice, isSelfServeTier } from './pricing'
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
 * Creates a Razorpay order for a clinic to pay for a subscription.
 *
 * This action:
 * 1. Verifies the caller is a clinic admin
 * 2. Computes the exact price using the locked pricing function
 * 3. Creates a Razorpay order
 * 4. Inserts a pending subscription record (for reconciliation if webhook fails)
 * 5. Returns order details so the client can open Razorpay checkout
 *
 * The subscription record is created as 'pending' because the clinic hasn't
 * actually paid yet. Only a verified webhook event (Step 6) transitions it
 * to 'active' or 'failed'. This design means if the webhook is delayed or
 * drops, we can still reconcile from the subscription table using the order_id.
 */
export async function createCheckoutOrderAction(
  tier: SubscriptionTier,
  term: SubscriptionTerm
): Promise<ActionResult<CheckoutOrderData>> {
  try {
    // Verify caller is clinic admin — this is the only person allowed to
    // initiate payment for a clinic's subscription.
    const admin = await requireAdmin()

    if (!admin.clinic_id) {
      return { success: false, error: 'Clinic not found' }
    }

    // Compute the exact price. This is the single source of truth for what
    // the clinic pays. The client never sends an amount — we compute it
    // server-side and hand it to Razorpay.
    const quote = computePrice(tier, term)

    if (quote.kind !== 'priced') {
      return { success: false, error: 'Enterprise tier requires manual sales process' }
    }

    // Create the Razorpay order. The order_id is what we'll match against
    // the webhook payload later.
    const order = await razorpay.orders.create({
      amount: quote.totalPaise, // Razorpay expects paise
      currency: 'INR',
      receipt: `clinic-${admin.clinic_id.slice(0, 8)}-${Date.now()}`,
    })

    if (!order.id) {
      return { success: false, error: 'Failed to create payment order' }
    }

    // Insert a pending subscription row. This serves two purposes:
    // 1. If the webhook arrives and completes the payment, we update this row
    // 2. If the webhook is delayed/fails, we still have a record to reconcile against
    // The razorpay_order_id is a UNIQUE constraint, so this row is our idempotency key —
    // if the same order_id somehow lands twice (very unlikely, but possible with
    // network retries), the second insert silently fails.
    const supabase = createServerSupabaseClient()

    const { error: subscriptionError } = await supabase.from('subscriptions').insert({
      clinic_id: admin.clinic_id,
      razorpay_order_id: order.id,
      tier: quote.tier,
      term: quote.term,
      status: 'pending',
      amount_paise: quote.totalPaise,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

    if (subscriptionError) {
      // This could mean: (a) the order_id already exists (duplicate), or
      // (b) a genuine DB error. For now, we return the order anyway — the
      // webhook reconciliation step (Step 6) will handle duplicates gracefully
      // via the UNIQUE constraint on razorpay_order_id.
      console.error('[createCheckoutOrderAction] subscription insert failed:', subscriptionError)
    }

    // Return the order details to the client. The client will use orderId and
    // keyId to open Razorpay's checkout UI.
    return {
      success: true,
      data: {
        orderId: order.id,
        amount: quote.totalPaise,
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