import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { verifyRazorpaySignature } from '@/features/billing/webhooks'
import { TERM_YEARS } from '@/features/billing/pricing'
import type { SubscriptionTerm } from '@/features/billing/types'

// Webhook events we care about
type RazorpayWebhookEvent = 'payment.authorized' | 'payment.captured' | 'payment.failed'

interface RazorpayWebhookPayload {
  event: RazorpayWebhookEvent
  payload: {
    payment: {
      entity: {
        id: string // payment_id
        order_id: string // razorpay_order_id
        status: string
        amount: number
      }
    }
  }
}

/**
 * POST /api/webhooks/razorpay
 *
 * Receives payment confirmation from Razorpay.
 * Verifies the signature, updates the subscription from 'pending' → 'active',
 * and updates the clinic's renewal dates.
 *
 * Must be idempotent: the same webhook can arrive multiple times.
 * We use payment_id uniqueness to guard against duplicate processing.
 */
export async function POST(req: NextRequest) {
  try {
    // 1. Read the raw body for signature verification
    const body = await req.text()
    const signature = req.headers.get('x-razorpay-signature')

    if (!signature) {
      return NextResponse.json(
        { error: 'Missing signature header' },
        { status: 400 }
      )
    }

    // 2. Verify the signature
    const keySecret = process.env.RAZORPAY_KEY_SECRET
    if (!keySecret) {
      console.error('[razorpay webhook] RAZORPAY_KEY_SECRET not configured')
      return NextResponse.json(
        { error: 'Server misconfigured' },
        { status: 500 }
      )
    }

    const isValid = verifyRazorpaySignature(body, signature, keySecret)
    if (!isValid) {
      console.warn('[razorpay webhook] Signature verification failed')
      // Return 200 anyway so Razorpay doesn't retry — a signature failure
      // means either the webhook is spoofed or our key is wrong, neither of
      // which will be fixed by retry.
      return NextResponse.json({ ok: true }, { status: 200 })
    }

    // 3. Parse the webhook payload
    const payload: RazorpayWebhookPayload = JSON.parse(body)

    // Only process payment success events
    if (
      payload.event !== 'payment.authorized' &&
      payload.event !== 'payment.captured'
    ) {
      return NextResponse.json({ ok: true }, { status: 200 })
    }

    const paymentId = payload.payload.payment.entity.id
    const orderId = payload.payload.payment.entity.order_id

    if (!paymentId || !orderId) {
      console.warn('[razorpay webhook] Missing payment_id or order_id')
      return NextResponse.json({ ok: true }, { status: 200 })
    }

    // 4. Find the pending subscription matching this order
    const supabase = createServerSupabaseClient()

    const { data: subscription, error: fetchError } = await supabase
      .from('subscriptions')
      .select('id, clinic_id, tier, term, status')
      .eq('razorpay_order_id', orderId)
      .single()

    if (fetchError || !subscription) {
      console.warn(
        `[razorpay webhook] No subscription found for order ${orderId}`
      )
      return NextResponse.json({ ok: true }, { status: 200 })
    }

    // Guard against double-processing: if this subscription is already
    // active, the webhook was probably retried. Idempotency check.
    if (subscription.status !== 'pending') {
      console.info(
        `[razorpay webhook] Subscription ${subscription.id} already ${subscription.status}, ignoring retry`
      )
      return NextResponse.json({ ok: true }, { status: 200 })
    }

    // 5. Calculate the new renewal dates
    const now = new Date()
    const term = subscription.term as SubscriptionTerm
    const years = TERM_YEARS[term]

    // current_period_start = today (when payment confirmed)
    const periodStart = now
    // current_period_end = today + term length
    const periodEnd = new Date(now)
    periodEnd.setFullYear(periodEnd.getFullYear() + years)

    // 6. Update the subscription
    const { error: updateSubError } = await supabase
      .from('subscriptions')
      .update({
        status: 'active',
        razorpay_payment_id: paymentId,
        current_period_start: periodStart.toISOString(),
        current_period_end: periodEnd.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq('id', subscription.id)

    if (updateSubError) {
      console.error('[razorpay webhook] Failed to update subscription:', updateSubError)
      return NextResponse.json(
        { error: 'Failed to update subscription' },
        { status: 500 }
      )
    }

    // 7. Update the clinic's subscription status
    const { error: updateClinicError } = await supabase
      .from('clinics')
      .update({
        subscription_status: 'active',
        subscription_tier: subscription.tier,
        subscription_term: term,
        current_period_start: periodStart.toISOString(),
        current_period_end: periodEnd.toISOString(),
        trial_ends_at: null, // Clear trial end date now that they're paid
      })
      .eq('id', subscription.clinic_id)

    if (updateClinicError) {
      console.error('[razorpay webhook] Failed to update clinic:', updateClinicError)
      // Still return 200; the subscription is already marked active above,
      // so retrying won't fix the clinic update. Log it for manual review.
      return NextResponse.json({ ok: true }, { status: 200 })
    }

    console.info(
      `[razorpay webhook] Payment ${paymentId} confirmed, subscription ${subscription.id} activated`
    )

    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (err) {
    console.error('[razorpay webhook] Unexpected error:', err)
    // Return 500 so Razorpay retries, but this should be rare if inputs are valid
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}