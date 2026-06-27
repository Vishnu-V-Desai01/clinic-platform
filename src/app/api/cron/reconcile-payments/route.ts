// src/app/api/cron/reconcile-payments/route.ts

/**
 * Vercel Cron endpoint: Daily payment reconciliation.
 * Runs deterministically based on SQL rules to flag overdue/outstanding payments.
 * Not AI; purely rule-based automation.
 *
 * Triggered by: vercel.json cron config (see below)
 * Schedule: Daily at 2 AM UTC
 */

import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

// Use Supabase service role (server-to-server, bypasses RLS)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  // Verify Vercel Cron signature (security check)
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const result = await reconcilePayments();
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error('[reconcile-payments] Error:', error);
    return NextResponse.json(
      {
        error: 'Reconciliation failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * Core reconciliation logic: deterministic SQL-based rules.
 * 1. Find all approved payments with outstanding balance (unpaid/partial)
 * 2. Flag those older than 30 days as overdue
 * 3. Create payment_alerts snapshots with escalation levels
 * 4. Mark existing alerts as resolved if payment was collected since last run
 */
async function reconcilePayments() {
  const startTime = Date.now();

  // Step 1: Identify overdue payments (approved, unpaid/partial, > 30 days old)
  const { data: overduePayments, error: queryError } = await supabase
    .from('payments')
    .select(
      `
      id,
      clinic_id,
      patient_id,
      appointment_id,
      amount_charged,
      amount_paid,
      outstanding_balance,
      payment_status,
      created_at
    `
    )
    .eq('approval_status', 'approved')
    .in('payment_status', ['unpaid', 'partial'])
    .eq('is_overdue', true); // Trigger maintains this; returns TRUE if unpaid/partial AND > 30 days

  if (queryError) {
    throw new Error(`Query failed: ${queryError.message}`);
  }

  const alertsToCreate = [];
  const alertsToResolve = [];

  // Step 2: For each overdue payment, create or update an alert
  for (const payment of overduePayments || []) {
    const createdAt = new Date(payment.created_at);
    const daysOverdue = Math.floor(
      (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Determine escalation level: warning (30-60 days), urgent (> 60 days)
    const escalationLevel = daysOverdue > 60 ? 'urgent' : 'warning';

    // Determine alert type
    const alertType =
      payment.payment_status === 'unpaid' ? 'overdue_unpaid' : 'overdue_partial';

    // Check if alert already exists for this payment
    const { data: existingAlert } = await supabase
      .from('payment_alerts')
      .select('id')
      .eq('payment_id', payment.id)
      .is('resolved_at', null)
      .single();

    if (!existingAlert) {
      // Create new alert
      alertsToCreate.push({
        clinic_id: payment.clinic_id,
        payment_id: payment.id,
        patient_id: payment.patient_id,
        appointment_id: payment.appointment_id,
        amount_charged: payment.amount_charged,
        amount_paid: payment.amount_paid,
        outstanding_balance: payment.outstanding_balance,
        payment_status: payment.payment_status,
        alert_type: alertType,
        days_overdue: daysOverdue,
        escalation_level: escalationLevel,
        alert_created_at: new Date().toISOString(),
        resolved_at: null,
      });
    }
  }

  // Step 3: Resolve alerts for payments that are now paid
  const { data: paidPayments } = await supabase
    .from('payments')
    .select('id')
    .eq('approval_status', 'approved')
    .eq('payment_status', 'paid');

  if (paidPayments && paidPayments.length > 0) {
    const paidPaymentIds = paidPayments.map((p) => p.id);

    // Mark alerts as resolved
    const { error: resolveError } = await supabase
      .from('payment_alerts')
      .update({
        resolved_at: new Date().toISOString(),
      })
      .in('payment_id', paidPaymentIds)
      .is('resolved_at', null);

    if (resolveError) {
      console.error('[reconcilePayments] Resolve error:', resolveError);
    }
  }

  // Step 4: Batch insert new alerts
  let alertsCreated = 0;
  if (alertsToCreate.length > 0) {
    const { error: insertError, data: inserted } = await supabase
      .from('payment_alerts')
      .insert(alertsToCreate)
      .select();

    if (insertError) {
      throw new Error(`Alert insert failed: ${insertError.message}`);
    }

    alertsCreated = inserted?.length || 0;
  }

  const duration = Date.now() - startTime;

  return {
    success: true,
    timestamp: new Date().toISOString(),
    alerts_created: alertsCreated,
    duration_ms: duration,
    message: `Reconciliation complete. Created ${alertsCreated} alerts.`,
  };
}