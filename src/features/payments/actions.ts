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
  AddLineItemSchema,
  UpdateLineItemSchema,
  RemoveLineItemSchema,
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
  PaymentLineItem,
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

// Compute a summary description from line items
function descriptionFromLineItems(items: Array<{ description: string }>): string {
  if (items.length === 0) return 'Charge';
  if (items.length === 1) return items[0].description;
  return items[0].description + ' (and ' + (items.length - 1) + ' more)';
}

// ── Read functions ────────────────────────────────────────────────────────────

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

export async function getPaymentLineItems(
  paymentId: string
): Promise<PaymentLineItem[]> {
  const supabase = createServerSupabaseClient();
  const profile = await getOrCreateProfile();
  if (!profile) return [];

  await requireRole('doctor', 'staff');

  const { data, error } = await supabase
    .from('payment_line_items')
    .select('*')
    .eq('payment_id', paymentId)
    .eq('clinic_id', profile.clinic_id)
    .order('sort_order', { ascending: true });

  if (error) {
    console.error('[getPaymentLineItems]', error);
    return [];
  }

  return (data || []) as PaymentLineItem[];
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
      appointments (appointment_date),
      payment_line_items (id, description, quantity, unit_price, total_price, sort_order)
    `
    )
    .eq('clinic_id', profile.clinic_id)
    .eq('approval_status', 'pending')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[getPendingApprovalPayments]', error);
    return [];
  }

  return (data || []).map((row: any) => {
    const lineItems = (row.payment_line_items || []).sort(
      (a: any, b: any) => a.sort_order - b.sort_order
    );
    return {
      id: row.id,
      patientName: patientFullName(row.patients),
      patientMrn: row.patients?.patient_id_number || 'N/A',
      service: row.description || 'Charge',
      date: row.appointments?.appointment_date || row.created_at,
      proposedAmountPaise: Math.round((row.amount_charged || 0) * 100),
      hasLineItems: lineItems.length > 0,
      lineItems,
    };
  });
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

    const hasReceipt = row.approval_status === 'approved';

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

// ── Line item mutations ───────────────────────────────────────────────────────

export async function addPaymentLineItem(
  input: z.infer<typeof AddLineItemSchema>
) {
  try {
    const supabase = createServerSupabaseClient();
    const profile = await getOrCreateProfile();
    if (!profile) return { success: false, error: 'Profile not found' };

    await requireRole('doctor', 'staff');

    const v = AddLineItemSchema.parse(input);

    // Verify payment belongs to this clinic
    const { data: payment, error: fetchError } = await supabase
      .from('payments')
      .select('id, amount_paid, approval_status')
      .eq('id', v.payment_id)
      .eq('clinic_id', profile.clinic_id)
      .single();

    if (fetchError || !payment) return { success: false, error: 'Payment not found' };

    const { error } = await supabase.from('payment_line_items').insert({
      clinic_id: profile.clinic_id,
      payment_id: v.payment_id,
      description: v.description,
      quantity: v.quantity,
      unit_price: v.unit_price,
      sort_order: v.sort_order,
    });

    if (error) {
      console.error('[addPaymentLineItem]', error);
      return { success: false, error: error.message };
    }

    // Update summary description on the payment
    const { data: allItems } = await supabase
      .from('payment_line_items')
      .select('description')
      .eq('payment_id', v.payment_id)
      .order('sort_order');

    const newDescription = descriptionFromLineItems(allItems || []);
    await supabase
      .from('payments')
      .update({ description: newDescription })
      .eq('id', v.payment_id)
      .eq('clinic_id', profile.clinic_id);

    revalidatePath('/dashboard/payments');
    revalidatePath('/dashboard/payments/approvals');
    return { success: true };
  } catch (err: any) {
    console.error('[addPaymentLineItem] Unexpected error:', err);
    return { success: false, error: err?.message || 'Unexpected error' };
  }
}

export async function updatePaymentLineItem(
  input: z.infer<typeof UpdateLineItemSchema>
) {
  try {
    const supabase = createServerSupabaseClient();
    const profile = await getOrCreateProfile();
    if (!profile) return { success: false, error: 'Profile not found' };

    await requireRole('doctor', 'staff');

    const v = UpdateLineItemSchema.parse(input);

    // Verify the line item and parent payment
    const { data: item, error: itemError } = await supabase
      .from('payment_line_items')
      .select('*, payments (amount_paid, amount_charged)')
      .eq('id', v.id)
      .eq('clinic_id', profile.clinic_id)
      .single();

    if (itemError || !item) return { success: false, error: 'Line item not found' };

    // Validate: new total >= amount_paid
    const payment: any = item.payments;
    const newItemTotal = v.quantity * v.unit_price;
    const otherItemsTotal = (payment.amount_charged || 0) - (item.total_price || 0);
    const newTotal = otherItemsTotal + newItemTotal;

    if (newTotal < (payment.amount_paid || 0)) {
      return {
        success: false,
        error: `Cannot reduce bill below amount already paid (Rs. ${payment.amount_paid.toFixed(2)})`,
      };
    }

    const { error } = await supabase
      .from('payment_line_items')
      .update({
        description: v.description,
        quantity: v.quantity,
        unit_price: v.unit_price,
        updated_at: new Date().toISOString(),
      })
      .eq('id', v.id)
      .eq('clinic_id', profile.clinic_id);

    if (error) {
      console.error('[updatePaymentLineItem]', error);
      return { success: false, error: error.message };
    }

    // Refresh summary description
    const { data: allItems } = await supabase
      .from('payment_line_items')
      .select('description')
      .eq('payment_id', v.payment_id)
      .order('sort_order');

    const newDescription = descriptionFromLineItems(allItems || []);
    await supabase
      .from('payments')
      .update({ description: newDescription })
      .eq('id', v.payment_id)
      .eq('clinic_id', profile.clinic_id);

    revalidatePath('/dashboard/payments');
    revalidatePath('/dashboard/payments/approvals');
    return { success: true };
  } catch (err: any) {
    console.error('[updatePaymentLineItem] Unexpected error:', err);
    return { success: false, error: err?.message || 'Unexpected error' };
  }
}

export async function removePaymentLineItem(
  input: z.infer<typeof RemoveLineItemSchema>
) {
  try {
    const supabase = createServerSupabaseClient();
    const profile = await getOrCreateProfile();
    if (!profile) return { success: false, error: 'Profile not found' };

    await requireRole('doctor', 'staff');

    const v = RemoveLineItemSchema.parse(input);

    // Fetch item + parent payment for validation
    const { data: item, error: itemError } = await supabase
      .from('payment_line_items')
      .select('*, payments (amount_paid, amount_charged)')
      .eq('id', v.id)
      .eq('clinic_id', profile.clinic_id)
      .single();

    if (itemError || !item) return { success: false, error: 'Line item not found' };

    const payment: any = item.payments;
    const newTotal = (payment.amount_charged || 0) - (item.total_price || 0);

    if (newTotal < (payment.amount_paid || 0)) {
      return {
        success: false,
        error: `Cannot remove this item — total would be less than amount already paid (Rs. ${payment.amount_paid.toFixed(2)})`,
      };
    }

    const { error } = await supabase
      .from('payment_line_items')
      .delete()
      .eq('id', v.id)
      .eq('clinic_id', profile.clinic_id);

    if (error) {
      console.error('[removePaymentLineItem]', error);
      return { success: false, error: error.message };
    }

    // Refresh summary description
    const { data: allItems } = await supabase
      .from('payment_line_items')
      .select('description')
      .eq('payment_id', v.payment_id)
      .order('sort_order');

    const newDescription = descriptionFromLineItems(allItems || []);
    await supabase
      .from('payments')
      .update({ description: newDescription.length > 0 ? newDescription : 'Charge' })
      .eq('id', v.payment_id)
      .eq('clinic_id', profile.clinic_id);

    revalidatePath('/dashboard/payments');
    revalidatePath('/dashboard/payments/approvals');
    return { success: true };
  } catch (err: any) {
    console.error('[removePaymentLineItem] Unexpected error:', err);
    return { success: false, error: err?.message || 'Unexpected error' };
  }
}

// ── Charge creation ───────────────────────────────────────────────────────────

export async function createManualCharge(
  input: z.infer<typeof CreateManualChargeSchema>
) {
  try {
    const supabase = createServerSupabaseClient();
    const profile = await getOrCreateProfile();
    if (!profile) return { success: false, error: 'Profile not found' };

    await requireRole('doctor', 'staff');

    const v = CreateManualChargeSchema.parse(input);
    const description = descriptionFromLineItems(v.line_items);

    // Create payment — amount_charged starts at 0, trigger updates it
    const { data: newPayment, error: insertError } = await supabase
      .from('payments')
      .insert({
        clinic_id: profile.clinic_id,
        patient_id: v.patient_id,
        appointment_id: null,
        description,
        amount_charged: v.line_items.reduce(
  (sum, item) => sum + item.quantity * item.unit_price, 0
),
amount_paid: 0,
approval_status: 'pending',
        approval_notes: v.approval_notes || null,
        created_by: profile.id,
      })
      .select()
      .single();

    if (insertError || !newPayment) {
      console.error('[createManualCharge] DB error:', insertError);
      return { success: false, error: insertError?.message || 'Failed to create charge' };
    }

    // Insert line items — trigger fires per row and updates amount_charged
    const lineItemRows = v.line_items.map((item, idx) => ({
      clinic_id: profile.clinic_id,
      payment_id: newPayment.id,
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unit_price,
      sort_order: idx,
    }));

    const { error: lineItemError } = await supabase
      .from('payment_line_items')
      .insert(lineItemRows);

    if (lineItemError) {
      console.error('[createManualCharge] Line items error:', lineItemError);
      return { success: false, error: 'Failed to save line items: ' + lineItemError.message };
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

    const v = CreateManualChargeSchema.parse(input);
    const description = descriptionFromLineItems(v.line_items);

    // Generate atomic receipt number before insert
    const { data: receiptNumber, error: receiptError } = await supabase
      .rpc('next_receipt_number', { p_clinic_id: profile.clinic_id });

    if (receiptError || !receiptNumber) {
      console.error('[createManualChargeAndApprove] Receipt number error:', receiptError);
      return { success: false, error: 'Failed to generate receipt number' };
    }

    // Create approved payment — amount_charged starts at 0, trigger updates it
    const { data: newPayment, error: insertError } = await supabase
      .from('payments')
      .insert({
        clinic_id: profile.clinic_id,
        patient_id: v.patient_id,
        appointment_id: null,
        description,
        amount_charged: v.line_items.reduce(
  (sum, item) => sum + item.quantity * item.unit_price, 0
),
amount_paid: 0,
approval_status: 'approved',
        approved_by: profile.id,
        approved_at: new Date().toISOString(),
        approval_notes: v.approval_notes || null,
        created_by: profile.id,
        receipt_number: receiptNumber,
      })
      .select()
      .single();

    if (insertError || !newPayment) {
      console.error('[createManualChargeAndApprove] DB error:', insertError);
      return { success: false, error: insertError?.message || 'Failed to create charge' };
    }

    // Insert line items — trigger fires per row and updates amount_charged
    const lineItemRows = v.line_items.map((item, idx) => ({
      clinic_id: profile.clinic_id,
      payment_id: newPayment.id,
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unit_price,
      sort_order: idx,
    }));

    const { error: lineItemError } = await supabase
      .from('payment_line_items')
      .insert(lineItemRows);

    if (lineItemError) {
      console.error('[createManualChargeAndApprove] Line items error:', lineItemError);
      return { success: false, error: 'Failed to save line items: ' + lineItemError.message };
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

    const v = SetAmountAndApprovePaymentSchema.parse(input);

    const { data: payment, error: fetchError } = await supabase
      .from('payments')
      .select('*')
      .eq('id', v.payment_id)
      .eq('clinic_id', profile.clinic_id)
      .single();

    if (fetchError || !payment) return { success: false, error: 'Payment not found' };

    if (payment.approval_status !== 'pending') {
      return { success: false, error: 'Only pending charges can be approved' };
    }

    // Check if this payment has line items
    // If it does, amount_charged is maintained by trigger — don't override it
    const { count: lineItemCount } = await supabase
      .from('payment_line_items')
      .select('id', { count: 'exact', head: true })
      .eq('payment_id', v.payment_id)
      .eq('clinic_id', profile.clinic_id);

    const hasLineItems = (lineItemCount || 0) > 0;

    let receiptNumber = payment.receipt_number || null;
    if (!receiptNumber) {
      const { data: newReceiptNumber, error: receiptError } = await supabase
        .rpc('next_receipt_number', { p_clinic_id: profile.clinic_id });

      if (receiptError || !newReceiptNumber) {
        console.error('[setAmountAndApprovePayment] Receipt number error:', receiptError);
        return { success: false, error: 'Failed to generate receipt number' };
      }
      receiptNumber = newReceiptNumber;
    }

    const updatePayload: Record<string, any> = {
      approval_status: 'approved',
      approved_by: profile.id,
      approved_at: new Date().toISOString(),
      approval_notes: v.approval_notes || null,
      receipt_number: receiptNumber,
      updated_at: new Date().toISOString(),
    };

    // Only set amount manually if no line items — trigger manages it otherwise
    if (!hasLineItems) {
      updatePayload.amount_charged = v.amount_charged;
    }

    const { error: updateError } = await supabase
      .from('payments')
      .update(updatePayload)
      .eq('id', v.payment_id)
      .eq('clinic_id', profile.clinic_id);

    if (updateError) {
      console.error('[setAmountAndApprovePayment]', updateError);
      return { success: false, error: 'Failed to approve charge' };
    }

    try {
      await generateAndStorePaymentDocuments(v.payment_id);
    } catch (docError) {
      console.error('[setAmountAndApprovePayment] Doc generation failed:', docError);
    }

    revalidatePath('/dashboard/payments');
    revalidatePath('/dashboard/payments/approvals');
    return { success: true, payment_id: v.payment_id };
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

    const v = ApprovePaymentSchema.parse(input);

    const { data: payment, error: fetchError } = await supabase
      .from('payments')
      .select('*')
      .eq('id', v.payment_id)
      .eq('clinic_id', profile.clinic_id)
      .single();

    if (fetchError || !payment) return { success: false, error: 'Payment not found' };

    if (
      v.approval_status === 'approved' &&
      (!payment.amount_charged || payment.amount_charged === 0)
    ) {
      return { success: false, error: 'Amount charged must be set before approval' };
    }

    let receiptNumber = payment.receipt_number || null;
    if (v.approval_status === 'approved' && !receiptNumber) {
      const { data: newReceiptNumber, error: receiptError } = await supabase
        .rpc('next_receipt_number', { p_clinic_id: profile.clinic_id });

      if (receiptError || !newReceiptNumber) {
        console.error('[approvePayment] Receipt number error:', receiptError);
        return { success: false, error: 'Failed to generate receipt number' };
      }
      receiptNumber = newReceiptNumber;
    }

    const { error: updateError } = await supabase
      .from('payments')
      .update({
        approval_status: v.approval_status,
        approved_by: profile.id,
        approved_at: new Date().toISOString(),
        approval_notes: v.approval_notes || null,
        receipt_number: receiptNumber,
        updated_at: new Date().toISOString(),
      })
      .eq('id', v.payment_id)
      .eq('clinic_id', profile.clinic_id);

    if (updateError) {
      console.error('[approvePayment]', updateError);
      return { success: false, error: 'Failed to update payment' };
    }

    if (v.approval_status === 'approved') {
      try {
        await generateAndStorePaymentDocuments(v.payment_id);
      } catch (docError) {
        console.error('[approvePayment] Doc generation failed:', docError);
      }
    }

    revalidatePath('/dashboard/payments');
    revalidatePath('/dashboard/payments/approvals');
    return { success: true, payment_id: v.payment_id };
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

    const v = UpdatePaymentAmountSchema.parse(input);

    const { data: payment, error: fetchError } = await supabase
      .from('payments')
      .select('*')
      .eq('id', v.payment_id)
      .eq('clinic_id', profile.clinic_id)
      .single();

    if (fetchError || !payment) return { success: false, error: 'Payment not found' };

    if (payment.approval_status !== 'pending') {
      return { success: false, error: 'Cannot update amount for non-pending payments' };
    }

    const { error: updateError } = await supabase
      .from('payments')
      .update({
        amount_charged: v.amount_charged,
        updated_at: new Date().toISOString(),
      })
      .eq('id', v.payment_id)
      .eq('clinic_id', profile.clinic_id);

    if (updateError) {
      console.error('[updatePaymentAmount]', updateError);
      return { success: false, error: 'Failed to update amount' };
    }

    revalidatePath('/dashboard/payments');
    revalidatePath('/dashboard/payments/approvals');
    return { success: true, payment_id: v.payment_id };
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

    const v = CreatePaymentCollectionSchema.parse(input);

    const { data: payment, error: fetchError } = await supabase
      .from('payments')
      .select('*')
      .eq('id', v.payment_id)
      .eq('clinic_id', profile.clinic_id)
      .single();

    if (fetchError || !payment) return { success: false, error: 'Payment not found' };

    if (payment.approval_status !== 'approved') {
      return { success: false, error: 'Can only collect on approved payments' };
    }

    if (v.amount_collected > payment.outstanding_balance) {
      return {
        success: false,
        error: `Amount exceeds outstanding balance of Rs.${payment.outstanding_balance.toFixed(2)}`,
      };
    }

    const { data, error } = await supabase
      .from('payment_collections')
      .insert({
        clinic_id: profile.clinic_id,
        payment_id: v.payment_id,
        amount_collected: v.amount_collected,
        collection_date: v.collection_date.toISOString(),
        payment_method: v.payment_method,
        transaction_reference: v.transaction_reference || null,
        collected_by: profile.id,
        notes: v.notes || null,
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

    const v = UpdatePaymentCollectionSchema.parse(input);

    const { data: collection, error: fetchError } = await supabase
      .from('payment_collections')
      .select('*')
      .eq('id', v.id)
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
    const newTotal = otherCollectionsTotal + v.amount_collected;

    if (newTotal > payment.amount_charged) {
      return {
        success: false,
        error: `Total collections would exceed amount charged (Rs.${payment.amount_charged.toFixed(2)})`,
      };
    }

    const { error: updateError } = await supabase
      .from('payment_collections')
      .update({
        amount_collected: v.amount_collected,
        notes: v.notes || null,
        transaction_reference: v.transaction_reference || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', v.id)
      .eq('clinic_id', profile.clinic_id);

    if (updateError) {
      console.error('[updatePaymentCollection]', updateError);
      return { success: false, error: 'Failed to update collection' };
    }

    revalidatePath('/dashboard/payments');
    revalidatePath('/dashboard/payments/approvals');
    return { success: true, collection_id: v.id };
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
      `*, patients (first_name, last_name),
       appointments (appointment_date),
       profiles!created_by (full_name)`
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