import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabaseClient } from '@/lib/supabase/service'
import { verifyRazorpaySignature } from '@/features/billing/webhooks'
import { TERM_YEARS } from '@/features/billing/pricing'
import type { SubscriptionTerm } from '@/features/billing/types'

type RazorpayWebhookEvent = 'payment.authorized' | 'payment.captured' | 'payment.failed'

interface RazorpayWebhookPayload {
  event: RazorpayWebhookEvent
  payload: {
    payment: {
      entity: {
        id: string
        order_id: string
        status: string
        amount: number
      }
    }
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.text()
    const signature = req.headers.get('x-razorpay-signature')

    if (!signature) {
      return NextResponse.json({ error: 'Missing signature header' }, { status: 400 })
    }

    const keySecret = process.env.RAZORPAY_WEBHOOK_SECRET
    if (!keySecret) {
      console.error('[razorpay webhook] RAZORPAY_WEBHOOK_SECRET not configured')
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
    }

    const isValid = verifyRazorpaySignature(body, signature, keySecret)
    if (!isValid) {
      console.warn('[razorpay webhook] Signature verification failed')
      return NextResponse.json({ ok: true }, { status: 200 })
    }

    const payload: RazorpayWebhookPayload = JSON.parse(body)

    if (payload.event !== 'payment.authorized' && payload.event !== 'payment.captured') {
      return NextResponse.json({ ok: true }, { status: 200 })
    }

    const paymentId = payload.payload.payment.entity.id
    const orderId = payload.payload.payment.entity.order_id

    if (!paymentId || !orderId) {
      console.warn('[razorpay webhook] Missing payment_id or order_id')
      return NextResponse.json({ ok: true }, { status: 200 })
    }

    const supabase = createServiceSupabaseClient()
    const now = new Date()

    // ─────────────────────────────────────────────────────────
    // Case 1: this order_id matches a base subscription purchase
    // (fresh checkout — may or may not have accompanying add-on seats
    // sharing the same order_id, since both can be paid in one charge)
    // ─────────────────────────────────────────────────────────
    const { data: subscription, error: fetchSubError } = await supabase
      .from('subscriptions')
      .select('id, clinic_id, tier, term, status, amount_paise')
      .eq('razorpay_order_id', orderId)
      .maybeSingle()

    if (fetchSubError) {
      console.error('[razorpay webhook] subscription lookup failed:', fetchSubError)
      return NextResponse.json({ error: 'Lookup failed' }, { status: 500 })
    }

    if (subscription) {
      if (subscription.status !== 'pending') {
        console.info(
          `[razorpay webhook] Subscription ${subscription.id} already ${subscription.status}, ignoring retry`
        )
        return NextResponse.json({ ok: true }, { status: 200 })
      }

      const term = subscription.term as SubscriptionTerm
      const years = TERM_YEARS[term]
      const periodStart = now
      const periodEnd = new Date(now)
      periodEnd.setFullYear(periodEnd.getFullYear() + years)

      const { error: updateSubError } = await supabase
        .from('subscriptions')
        .update({
          status: 'active',
          razorpay_payment_id: paymentId,
          starts_at: periodStart.toISOString(),
          ends_at: periodEnd.toISOString(),
          updated_at: now.toISOString(),
        })
        .eq('id', subscription.id)

      if (updateSubError) {
        console.error('[razorpay webhook] Failed to update subscription:', updateSubError)
        return NextResponse.json({ error: 'Failed to update subscription' }, { status: 500 })
      }

      const { error: updateClinicError } = await supabase
        .from('clinics')
        .update({
          subscription_status: 'active',
          subscription_tier: subscription.tier,
          subscription_term: term,
          current_period_start: periodStart.toISOString(),
          current_period_end: periodEnd.toISOString(),
          trial_ends_at: null,
        })
        .eq('id', subscription.clinic_id)

      if (updateClinicError) {
        console.error('[razorpay webhook] Failed to update clinic:', updateClinicError)
      }

      // If add-on seats were bought in the SAME order as this subscription
      // (initial checkout with seats), activate that row too.
      const { data: bundledAddon, error: bundledAddonFetchError } = await supabase
        .from('subscription_seat_addons')
        .select('id, status')
        .eq('razorpay_order_id', orderId)
        .maybeSingle()

      if (bundledAddonFetchError) {
        console.error(
          '[razorpay webhook] bundled seat addon lookup failed:',
          bundledAddonFetchError
        )
      } else if (bundledAddon && bundledAddon.status === 'pending') {
        const { error: addonUpdateError } = await supabase
          .from('subscription_seat_addons')
          .update({
            status: 'active',
            razorpay_payment_id: paymentId,
            updated_at: now.toISOString(),
          })
          .eq('id', bundledAddon.id)

        if (addonUpdateError) {
          console.error('[razorpay webhook] Failed to activate bundled seat addon:', addonUpdateError)
        }
      }

      // Generate an invoice for the combined payment. Not fatal if it
      // fails — the subscription is already active, which is what
      // actually gates access.
      const invoiceAmountPaise =
        subscription.amount_paise +
        (bundledAddon && bundledAddon.status === 'pending' ? 0 : 0) // amount already includes addon at order level if bundled; see note below

      await createInvoice(supabase, {
        clinicId: subscription.clinic_id,
        subscriptionId: subscription.id,
        amountPaise: payload.payload.payment.entity.amount, // authoritative: what was actually charged
        description: `${subscription.tier} plan — ${term}`,
        now,
      })

      console.info(
        `[razorpay webhook] Payment ${paymentId} confirmed, subscription ${subscription.id} activated`
      )

      return NextResponse.json({ ok: true }, { status: 200 })
    }

    // ─────────────────────────────────────────────────────────
    // Case 2: this order_id matches a standalone mid-subscription seat
    // purchase (no matching subscriptions row — the base subscription is
    // already active and unaffected by this payment)
    // ─────────────────────────────────────────────────────────
    const { data: addon, error: fetchAddonError } = await supabase
      .from('subscription_seat_addons')
      .select('id, clinic_id, seats, status, amount_paise')
      .eq('razorpay_order_id', orderId)
      .maybeSingle()

    if (fetchAddonError) {
      console.error('[razorpay webhook] seat addon lookup failed:', fetchAddonError)
      return NextResponse.json({ error: 'Lookup failed' }, { status: 500 })
    }

    if (!addon) {
      console.warn(`[razorpay webhook] No subscription or seat addon found for order ${orderId}`)
      return NextResponse.json({ ok: true }, { status: 200 })
    }

    if (addon.status !== 'pending') {
      console.info(
        `[razorpay webhook] Seat addon ${addon.id} already ${addon.status}, ignoring retry`
      )
      return NextResponse.json({ ok: true }, { status: 200 })
    }

    const { error: updateAddonError } = await supabase
      .from('subscription_seat_addons')
      .update({
        status: 'active',
        razorpay_payment_id: paymentId,
        updated_at: now.toISOString(),
      })
      .eq('id', addon.id)

    if (updateAddonError) {
      console.error('[razorpay webhook] Failed to activate seat addon:', updateAddonError)
      return NextResponse.json({ error: 'Failed to activate seat addon' }, { status: 500 })
    }

    await createInvoice(supabase, {
      clinicId: addon.clinic_id,
      subscriptionId: null,
      amountPaise: payload.payload.payment.entity.amount,
      description: `${addon.seats} additional doctor seat${addon.seats > 1 ? 's' : ''}`,
      now,
    })

    console.info(`[razorpay webhook] Payment ${paymentId} confirmed, seat addon ${addon.id} activated`)

    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (err) {
    console.error('[razorpay webhook] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * Shared invoice-creation helper. Not fatal if it fails — logged for
 * manual follow-up, since the payment itself is already confirmed and
 * activated by the time this runs.
 */
async function createInvoice(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  args: {
    clinicId: string
    subscriptionId: string | null
    amountPaise: number
    description: string
    now: Date
  }
) {
  const { data: invoiceNumber, error: invoiceNumberError } = await supabase.rpc(
    'next_invoice_number'
  )

  if (invoiceNumberError || !invoiceNumber) {
    console.error('[razorpay webhook] Failed to generate invoice number:', invoiceNumberError)
    return
  }

  const { error: invoiceInsertError } = await supabase.from('invoices').insert({
    clinic_id: args.clinicId,
    subscription_id: args.subscriptionId,
    invoice_number: invoiceNumber,
    amount_paise: args.amountPaise,
    currency: 'INR',
    status: 'paid',
    description: args.description,
    issued_at: args.now.toISOString(),
    paid_at: args.now.toISOString(),
  })

  if (invoiceInsertError) {
    console.error('[razorpay webhook] Failed to insert invoice:', invoiceInsertError)
  }
}