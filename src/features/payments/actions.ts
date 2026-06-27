// src/features/payments/actions.ts

'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getOrCreateProfile, requireRole } from '@/lib/supabase/profile';
import {
  CreatePaymentCollectionSchema,
  UpdatePaymentCollectionSchema,
  ApprovePaymentSchema,
  UpdatePaymentAmountSchema,
  SetAmountAndApprovePaymentSchema,
  CreateManualChargeSchema,
} from './schema';
import type {
  PaymentCollection,
  PaymentWithCollections,
  PaymentListItem,
  PaymentAlert,
  PendingChargeView,
  ApprovedChargeView,
  PaymentDashboardRow,
  PaymentDashboardMetrics,
  PaymentDashboardByMode,
  PatientPickerItem,
} from './types';
import { generateAndStorePaymentDocuments } from './document-storage';
import type { z } from 'zod';

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: 'Cash',
  card: 'Card',
  upi: 'UPI',
  bank_transfer: 'Bank Transfer',
  check: 'Cheque',
  other: 'Other',
};

function patientFullName(row: any): string {
  return `${row?.first_name || ''} ${row?.last_name || ''}`.trim() || 'Unknown';
}

export async function getPaymentWithCollections(
  paymentId: string
): Promise<PaymentWithCollections | null> {
  const supabase = createServerSupabaseClient();
  const profile = await getOrCreateProfile();
  if (!profile) return null;

  await requireRole('doctor', 'staff');

  const { data, error } = await supabase
    .from('payments')
    .select('*, payment_collections (*)')
    .eq('id', paymentId)
    .eq('clinic_id', profile.clinic_id)
    .single();

  if (error || !data) {
    console.error('[getPaymentWithCollections]', error);
    return null;
  }

  return data as PaymentWithCollections;
}

export async function listPayments(filters?: {
  approval_status?: string;
  payment_status?: string;
  is_overdue?: boolean;
  patient_id?: string;
}) {
  const supabase = createServerSupabaseClient();
  const profile = await getOrCreateProfile();
  if (!profile) return [];

  await requireRole('doctor', 'staff');

  let query = supabase
    .from('payments')
    .select(
      `
      id,
      patient_id,
      appointment_id,
      amount_charged,
      amount_paid,
      outstanding_balance,
      payment_status,
      approval_status,
      is_overdue,
      created_at,
      created_by,
      patients (first_name, last_name),
      appointments (appointment_date),
      profiles!created_by (full_name)
    `
    )
    .eq('clinic_id', profile.clinic_id)
    .order('created_at', { ascending: false });

  if (filters?.approval_status) query = query.eq('approval_status', filters.approval_status);
  if (filters?.payment_status) query = query.eq('payment_status', filters.payment_status);
  if (filters?.is_overdue !== undefined) query = query.eq('is_overdue', filters.is_overdue);
  if (filters?.patient_id) query = query.eq('patient_id', filters.patient_id);

  const { data, error } = await query;
  if (error) {
    console.error('[listPayments]', error);
    return [];
  }

  return (data || []).map((row: any) => ({
    id: row.id,
    patient_id: row.patient_id,
    patient_name: patientFullName(row.patients),
    appointment_id: row.appointment_id,
    appointment_datetime: row.appointments?.appointment_date || '',
    amount_charged: row.amount_charged,
    amount_paid: row.amount_paid,
    outstanding_balance: row.outstanding_balance,
    payment_status: row.payment_status,
    approval_status: row.approval_status,
    is_overdue: row.is_overdue,
    created_at: row.created_at,
    doctor_name: row.profiles?.full_name || 'Unknown',
  })) as PaymentListItem[];
}

export async function getPendingApprovalPayments(): Promise<PendingChargeView[]> {
  const supabase = createServerSupabaseClient();
  const profile = await getOrCreateProfile();
  if (!profile) return [];

  await requireRole('doctor', 'staff');

  const { data, error } = await supabase
    .from('payments')
    .select(
      `
      id,
      amount_charged,
      description,
      created_at,
      patients (first_name, last_name, patient_id_number),
      appointments (appointment_date)
    `
    )
    .eq('clinic_id', profile.clinic_id)
    .eq('approval_status', 'pending')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[getPendingApprovalPayments]', error);
    return [];
  }

  return (data || []).map((row: any) => ({
    id: row.id,
    patientName: patientFullName(row.patients),
    patientMrn: row.patients?.patient_id_number || 'N/A',
    service: row.description || 'Charge',
    date: row.appointments?.appointment_date || row.created_at,
    proposedAmountPaise: Math.round((row.amount_charged || 0) * 100),
  }));
}

export async function getApprovedOutstandingCharges(): Promise<ApprovedChargeView[]> {
  const supabase = createServerSupabaseClient();
  const profile = await getOrCreateProfile();
  if (!profile) return [];

  await requireRole('doctor', 'staff');

  const { data, error } = await supabase
    .from('payments')
    .select(
      `
      id,
      outstanding_balance,
      description,
      patients (first_name, last_name, patient_id_number),
      appointments (appointment_date)
    `
    )
    .eq('clinic_id', profile.clinic_id)
    .eq('approval_status', 'approved')
    .in('payment_status', ['unpaid', 'partial'])
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[getApprovedOutstandingCharges]', error);
    return [];
  }

  return (data || []).map((row: any) => ({
    id: row.id,
    patientName: patientFullName(row.patients),
    patientMrn: row.patients?.patient_id_number || 'N/A',
    service: row.description || 'Charge',
    amountDuePaise: Math.round((row.outstanding_balance || 0) * 100),
  }));
}

export async function getActivePatientsForCharge(): Promise<PatientPickerItem[]> {
  const supabase = createServerSupabaseClient();
  const profile = await getOrCreateProfile();
  if (!profile) return [];

  await requireRole('doctor', 'staff');

  const { data, error } = await supabase
    .from('patients')
    .select('id, first_name, last_name, patient_id_number')
    .eq('clinic_id', profile.clinic_id)
    .eq('status', 'active')
    .is('deleted_at', null)
    .order('first_name', { ascending: true });

  if (error) {
    console.error('[getActivePatientsForCharge]', error);
    return [];
  }

  return (data || []).map((row: any) => ({
    id: row.id,
    name: `${row.first_name || ''} ${row.last_name || ''}`.trim() || 'Unknown',
    mrn: row.patient_id_number || 'N/A',
  }));
}

export async function getPaymentsDashboardData(): Promise<{
  payments: PaymentDashboardRow[];
  metrics: PaymentDashboardMetrics;
  byMode: PaymentDashboardByMode;
}> {
  const empty = {
    payments: [] as PaymentDashboardRow[],
    metrics: {
      totalCollectedPaise: 0,
      outstandingPaise: 0,
      pendingApprovalPaise: 0,
      collectedTodayPaise: 0,
    },
    byMode: { cashPaise: 0, cardPaise: 0, upiPaise: 0, bankPaise: 0 },
  };

  const supabase = createServerSupabaseClient();
  const profile = await getOrCreateProfile();
  if (!profile) return empty;

  await requireRole('doctor', 'staff');

  const { data, error } = await supabase
    .from('payments')
    .select(
      `
      id,
      amount_charged,
      amount_paid,
      outstanding_balance,
      payment_status,
      approval_status,
      description,
      created_at,
      patients (first_name, last_name, patient_id_number),
      appointments (appointment_date),
      documents (document_type),
      payment_collections (amount_collected, payment_method, collection_date)
    `
    )
    .eq('clinic_id', profile.clinic_id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[getPaymentsDashboardData]', error);
    return empty;
  }

  const rows = data || [];
  const todayStr = new Date().toISOString().slice(0, 10);

  let totalCollected = 0;
  let totalOutstanding = 0;
  let pendingApprovalAmount = 0;
  let collectedToday = 0;
  const byMode = { cash: 0, card: 0, upi: 0, bank_transfer: 0 };

  const dashboardRows: PaymentDashboardRow[] = rows.map((row: any) => {
    totalCollected += row.amount_paid || 0;

    if (row.approval_status === 'approved' && row.payment_status !== 'paid') {
      totalOutstanding += row.outstanding_balance || 0;
    }

    if (row.approval_status === 'pending') {
      pendingApprovalAmount += row.amount_charged || 0;
    }

    let status: PaymentDashboardRow['status'];
    if (row.approval_status === 'pending') status = 'Pending Approval';
    else if (row.approval_status === 'rejected') status = 'Rejected';
    else if (row.approval_status === 'void') status = 'Void';
    else if (row.payment_status === 'paid') status = 'Paid';
    else if (row.payment_status === 'partial') status = 'Partially Paid';
    else status = 'Unpaid';

    const collections = row.payment_collections || [];
    const lastCollection =
      collections.length > 0
        ? collections.reduce((latest: any, c: any) =>
            new Date(c.collection_date) > new Date(latest.collection_date) ? c : latest
          )
        : null;

    collections.forEach((c: any) => {
      const amt = c.amount_collected || 0;
      if (c.payment_method === 'cash') byMode.cash += amt;
      else if (c.payment_method === 'card') byMode.card += amt;
      else if (c.payment_method === 'upi') byMode.upi += amt;
      else if (c.payment_method === 'bank_transfer') byMode.bank_transfer += amt;

      if (c.collection_date && c.collection_date.slice(0, 10) === todayStr) {
        collectedToday += amt;
      }
    });

    const hasReceipt = (row.documents || []).some(
      (d: any) => d.document_type === 'receipt'
    );

    return {
      id: row.id,
      patientName: patientFullName(row.patients),
      patientMrn: row.patients?.patient_id_number || 'N/A',
      service: row.description || 'Charge',
      date: row.appointments?.appointment_date || row.created_at,
      amountPaise: Math.round((row.amount_charged || 0) * 100),
      paidPaise: Math.round((row.amount_paid || 0) * 100),
      outstandingPaise: Math.round((row.outstanding_balance || 0) * 100),
      mode: lastCollection
        ? PAYMENT_METHOD_LABELS[lastCollection.payment_method] || lastCollection.payment_method
        : null,
      status,
      hasReceipt,
    };
  });

  return {
    payments: dashboardRows,
    metrics: {
      totalCollectedPaise: Math.round(totalCollected * 100),
      outstandingPaise: Math.round(totalOutstanding * 100),
      pendingApprovalPaise: Math.round(pendingApprovalAmount * 100),
      collectedTodayPaise: Math.round(collectedToday * 100),
    },
    byMode: {
      cashPaise: Math.round(byMode.cash * 100),
      cardPaise: Math.round(byMode.card * 100),
      upiPaise: Math.round(byMode.upi * 100),
      bankPaise: Math.round(byMode.bank_transfer * 100),
    },
  };
}

export async function createManualCharge(
  input: z.infer<typeof CreateManualChargeSchema>
) {
  try {
    const supabase = createServerSupabaseClient();
    const profile = await getOrCreateProfile();
    if (!profile) return { success: false, error: 'Profile not found' };

    await requireRole('doctor', 'staff');

    const validatedInput = CreateManualChargeSchema.parse(input);

    const { data: newPayment, error: insertError } = await supabase
      .from('payments')
      .insert({
        clinic_id: profile.clinic_id,
        patient_id: validatedInput.patient_id,
        appointment_id: null,
        description: validatedInput.description,
        amount_charged: validatedInput.amount_charged,
        amount_paid: 0,
        approval_status: 'pending',
        approval_notes: validatedInput.approval_notes || null,
        created_by: profile.id,
      })
      .select()
      .single();

    if (insertError || !newPayment) {
      console.error('[createManualCharge] DB error:', insertError);
      return { success: false, error: insertError?.message || 'Failed to create charge' };
    }

    revalidatePath('/dashboard/payments');
    revalidatePath('/dashboard/payments/approvals');
    return { success: true, payment_id: newPayment.id };
  } catch (err: any) {
    console.error('[createManualCharge] Unexpected error:', err);
    return { success: false, error: err?.message || 'Unexpected error creating charge' };
  }
}

export async function createManualChargeAndApprove(
  input: z.infer<typeof CreateManualChargeSchema>
) {
  try {
    const supabase = createServerSupabaseClient();
    const profile = await getOrCreateProfile();
    if (!profile) return { success: false, error: 'Profile not found' };

    await requireRole('doctor', 'staff');

    const validatedInput = CreateManualChargeSchema.parse(input);

    const { data: newPayment, error: insertError } = await supabase
      .from('payments')
      .insert({
        clinic_id: profile.clinic_id,
        patient_id: validatedInput.patient_id,
        appointment_id: null,
        description: validatedInput.description,
        amount_charged: validatedInput.amount_charged,
        amount_paid: 0,
        approval_status: 'approved',
        approved_by: profile.id,
        approved_at: new Date().toISOString(),
        approval_notes: validatedInput.approval_notes || null,
        created_by: profile.id,
      })
      .select()
      .single();

    if (insertError || !newPayment) {
      console.error('[createManualChargeAndApprove] DB error:', insertError);
      return { success: false, error: insertError?.message || 'Failed to create charge' };
    }

    try {
      await generateAndStorePaymentDocuments(newPayment.id);
    } catch (docError) {
      console.error('[createManualChargeAndApprove] Doc generation failed:', docError);
    }

    revalidatePath('/dashboard/payments');
    revalidatePath('/dashboard/payments/approvals');
    return { success: true, payment_id: newPayment.id };
  } catch (err: any) {
    console.error('[createManualChargeAndApprove] Unexpected error:', err);
    return { success: false, error: err?.message || 'Unexpected error creating charge' };
  }
}

export async function setAmountAndApprovePayment(
  input: z.infer<typeof SetAmountAndApprovePaymentSchema>
) {
  try {
    const supabase = createServerSupabaseClient();
    const profile = await getOrCreateProfile();
    if (!profile) return { success: false, error: 'Profile not found' };

    await requireRole('doctor', 'staff');

    const validatedInput = SetAmountAndApprovePaymentSchema.parse(input);

    const { data: payment, error: fetchError } = await supabase
      .from('payments')
      .select('*')
      .eq('id', validatedInput.payment_id)
      .eq('clinic_id', profile.clinic_id)
      .single();

    if (fetchError || !payment) return { success: false, error: 'Payment not found' };

    if (payment.approval_status !== 'pending') {
      return { success: false, error: 'Only pending charges can be approved' };
    }

    const { error: updateError } = await supabase
      .from('payments')
      .update({
        amount_charged: validatedInput.amount_charged,
        approval_status: 'approved',
        approved_by: profile.id,
        approved_at: new Date().toISOString(),
        approval_notes: validatedInput.approval_notes || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', validatedInput.payment_id)
      .eq('clinic_id', profile.clinic_id);

    if (updateError) {
      console.error('[setAmountAndApprovePayment]', updateError);
      return { success: false, error: 'Failed to approve charge' };
    }

    try {
      await generateAndStorePaymentDocuments(validatedInput.payment_id);
    } catch (docError) {
      console.error('[setAmountAndApprovePayment] Doc generation failed:', docError);
    }

    revalidatePath('/dashboard/payments');
    revalidatePath('/dashboard/payments/approvals');
    return { success: true, payment_id: validatedInput.payment_id };
  } catch (err: any) {
    console.error('[setAmountAndApprovePayment] Unexpected error:', err);
    return { success: false, error: err?.message || 'Unexpected error approving charge' };
  }
}

export async function approvePayment(
  input: z.infer<typeof ApprovePaymentSchema>
) {
  try {
    const supabase = createServerSupabaseClient();
    const profile = await getOrCreateProfile();
    if (!profile) return { success: false, error: 'Profile not found' };

    await requireRole('doctor', 'staff');

    const validatedInput = ApprovePaymentSchema.parse(input);

    const { data: payment, error: fetchError } = await supabase
      .from('payments')
      .select('*')
      .eq('id', validatedInput.payment_id)
      .eq('clinic_id', profile.clinic_id)
      .single();

    if (fetchError || !payment) return { success: false, error: 'Payment not found' };

    if (
      validatedInput.approval_status === 'approved' &&
      (!payment.amount_charged || payment.amount_charged === 0)
    ) {
      return { success: false, error: 'Amount charged must be set before approval' };
    }

    const { error: updateError } = await supabase
      .from('payments')
      .update({
        approval_status: validatedInput.approval_status,
        approved_by: profile.id,
        approved_at: new Date().toISOString(),
        approval_notes: validatedInput.approval_notes || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', validatedInput.payment_id)
      .eq('clinic_id', profile.clinic_id);

    if (updateError) {
      console.error('[approvePayment]', updateError);
      return { success: false, error: 'Failed to update payment' };
    }

    if (validatedInput.approval_status === 'approved') {
      try {
        await generateAndStorePaymentDocuments(validatedInput.payment_id);
      } catch (docError) {
        console.error('[approvePayment] Doc generation failed:', docError);
      }
    }

    revalidatePath('/dashboard/payments');
    revalidatePath('/dashboard/payments/approvals');
    return { success: true, payment_id: validatedInput.payment_id };
  } catch (err: any) {
    console.error('[approvePayment] Unexpected error:', err);
    return { success: false, error: err?.message || 'Unexpected error' };
  }
}

export async function updatePaymentAmount(
  input: z.infer<typeof UpdatePaymentAmountSchema>
) {
  try {
    const supabase = createServerSupabaseClient();
    const profile = await getOrCreateProfile();
    if (!profile) return { success: false, error: 'Profile not found' };

    await requireRole('doctor', 'staff');

    const validatedInput = UpdatePaymentAmountSchema.parse(input);

    const { data: payment, error: fetchError } = await supabase
      .from('payments')
      .select('*')
      .eq('id', validatedInput.payment_id)
      .eq('clinic_id', profile.clinic_id)
      .single();

    if (fetchError || !payment) return { success: false, error: 'Payment not found' };

    if (payment.approval_status !== 'pending') {
      return { success: false, error: 'Cannot update amount for non-pending payments' };
    }

    const { error: updateError } = await supabase
      .from('payments')
      .update({
        amount_charged: validatedInput.amount_charged,
        updated_at: new Date().toISOString(),
      })
      .eq('id', validatedInput.payment_id)
      .eq('clinic_id', profile.clinic_id);

    if (updateError) {
      console.error('[updatePaymentAmount]', updateError);
      return { success: false, error: 'Failed to update amount' };
    }

    revalidatePath('/dashboard/payments');
    revalidatePath('/dashboard/payments/approvals');
    return { success: true, payment_id: validatedInput.payment_id };
  } catch (err: any) {
    console.error('[updatePaymentAmount] Unexpected error:', err);
    return { success: false, error: err?.message || 'Unexpected error' };
  }
}

export async function recordPaymentCollection(
  input: z.infer<typeof CreatePaymentCollectionSchema>
) {
  try {
    const supabase = createServerSupabaseClient();
    const profile = await getOrCreateProfile();
    if (!profile) return { success: false, error: 'Profile not found' };

    await requireRole('doctor', 'staff');

    const validatedInput = CreatePaymentCollectionSchema.parse(input);

    const { data: payment, error: fetchError } = await supabase
      .from('payments')
      .select('*')
      .eq('id', validatedInput.payment_id)
      .eq('clinic_id', profile.clinic_id)
      .single();

    if (fetchError || !payment) return { success: false, error: 'Payment not found' };

    if (payment.approval_status !== 'approved') {
      return { success: false, error: 'Can only collect on approved payments' };
    }

    if (validatedInput.amount_collected > payment.outstanding_balance) {
      return {
        success: false,
        error: `Amount exceeds outstanding balance of Rs.${payment.outstanding_balance.toFixed(2)}`,
      };
    }

    const { data, error } = await supabase
      .from('payment_collections')
      .insert({
        clinic_id: profile.clinic_id,
        payment_id: validatedInput.payment_id,
        amount_collected: validatedInput.amount_collected,
        collection_date: validatedInput.collection_date.toISOString(),
        payment_method: validatedInput.payment_method,
        transaction_reference: validatedInput.transaction_reference || null,
        collected_by: profile.id,
        notes: validatedInput.notes || null,
      })
      .select()
      .single();

    if (error) {
      console.error('[recordPaymentCollection]', error);
      return { success: false, error: 'Failed to record collection' };
    }

    revalidatePath('/dashboard/payments');
    revalidatePath('/dashboard/payments/approvals');
    return { success: true, collection: data as PaymentCollection };
  } catch (err: any) {
    console.error('[recordPaymentCollection] Unexpected error:', err);
    return { success: false, error: err?.message || 'Unexpected error' };
  }
}

export async function updatePaymentCollection(
  input: z.infer<typeof UpdatePaymentCollectionSchema>
) {
  try {
    const supabase = createServerSupabaseClient();
    const profile = await getOrCreateProfile();
    if (!profile) return { success: false, error: 'Profile not found' };

    await requireRole('doctor', 'staff');

    const validatedInput = UpdatePaymentCollectionSchema.parse(input);

    const { data: collection, error: fetchError } = await supabase
      .from('payment_collections')
      .select('*')
      .eq('id', validatedInput.id)
      .eq('clinic_id', profile.clinic_id)
      .single();

    if (fetchError || !collection) return { success: false, error: 'Collection not found' };

    const { data: payment, error: paymentError } = await supabase
      .from('payments')
      .select('*')
      .eq('id', collection.payment_id)
      .eq('clinic_id', profile.clinic_id)
      .single();

    if (paymentError || !payment) return { success: false, error: 'Payment not found' };

    const otherCollectionsTotal =
      (payment.amount_paid || 0) - (collection.amount_collected || 0);
    const newTotal = otherCollectionsTotal + validatedInput.amount_collected;

    if (newTotal > payment.amount_charged) {
      return {
        success: false,
        error: `Total collections would exceed amount charged (Rs.${payment.amount_charged.toFixed(2)})`,
      };
    }

    const { error: updateError } = await supabase
      .from('payment_collections')
      .update({
        amount_collected: validatedInput.amount_collected,
        notes: validatedInput.notes || null,
        transaction_reference: validatedInput.transaction_reference || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', validatedInput.id)
      .eq('clinic_id', profile.clinic_id);

    if (updateError) {
      console.error('[updatePaymentCollection]', updateError);
      return { success: false, error: 'Failed to update collection' };
    }

    revalidatePath('/dashboard/payments');
    revalidatePath('/dashboard/payments/approvals');
    return { success: true, collection_id: validatedInput.id };
  } catch (err: any) {
    console.error('[updatePaymentCollection] Unexpected error:', err);
    return { success: false, error: err?.message || 'Unexpected error' };
  }
}

export async function getOutstandingPayments() {
  const supabase = createServerSupabaseClient();
  const profile = await getOrCreateProfile();
  if (!profile) return [];

  await requireRole('doctor', 'staff');

  const { data, error } = await supabase
    .from('payments')
    .select(
      `
      *,
      patients (first_name, last_name),
      appointments (appointment_date),
      profiles!created_by (full_name)
    `
    )
    .eq('clinic_id', profile.clinic_id)
    .eq('is_overdue', true)
    .eq('approval_status', 'approved')
    .in('payment_status', ['unpaid', 'partial'])
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[getOutstandingPayments]', error);
    return [];
  }

  return (data || []) as PaymentListItem[];
}

export async function getPaymentAlerts(filters?: {
  alert_type?: 'overdue_unpaid' | 'overdue_partial';
  escalation_level?: 'warning' | 'urgent';
  resolved?: boolean;
}) {
  const supabase = createServerSupabaseClient();
  const profile = await getOrCreateProfile();
  if (!profile) return [];

  await requireRole('doctor', 'staff');

  let query = supabase
    .from('payment_alerts')
    .select('*')
    .eq('clinic_id', profile.clinic_id)
    .order('alert_created_at', { ascending: false });

  if (filters?.alert_type) query = query.eq('alert_type', filters.alert_type);
  if (filters?.escalation_level) query = query.eq('escalation_level', filters.escalation_level);

  if (filters?.resolved !== undefined) {
    if (filters.resolved) {
      query = query.not('resolved_at', 'is', null);
    } else {
      query = query.is('resolved_at', null);
    }
  }

  const { data, error } = await query;
  if (error) {
    console.error('[getPaymentAlerts]', error);
    return [];
  }

  return (data || []) as PaymentAlert[];
}