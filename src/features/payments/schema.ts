// src/features/payments/schema.ts

import { z } from 'zod';

// ── Line item schemas ─────────────────────────────────────────────────────────

export const LineItemInputSchema = z.object({
  description: z.string().min(1, 'Description is required'),
  quantity: z.number().int().min(1, 'Quantity must be at least 1'),
  unit_price: z.number().min(0, 'Price cannot be negative'),
});

export const AddLineItemSchema = z.object({
  payment_id: z.string().uuid(),
  description: z.string().min(1, 'Description is required'),
  quantity: z.number().int().min(1),
  unit_price: z.number().min(0),
  sort_order: z.number().int().default(0),
});

export const UpdateLineItemSchema = z.object({
  id: z.string().uuid(),
  payment_id: z.string().uuid(),
  description: z.string().min(1, 'Description is required'),
  quantity: z.number().int().min(1),
  unit_price: z.number().min(0),
});

export const RemoveLineItemSchema = z.object({
  id: z.string().uuid(),
  payment_id: z.string().uuid(),
});

// ── Payment schemas ───────────────────────────────────────────────────────────

export const CreatePaymentCollectionSchema = z.object({
  payment_id: z.string().uuid(),
  amount_collected: z.number().min(0.01, 'Amount must be greater than 0'),
  collection_date: z.date(),
  payment_method: z.enum(['cash', 'card', 'upi', 'bank_transfer', 'check', 'other']),
  transaction_reference: z.string().nullish(),
  notes: z.string().nullish(),
});

export const UpdatePaymentCollectionSchema = z.object({
  id: z.string().uuid(),
  amount_collected: z.number().min(0.01),
  notes: z.string().nullish(),
  transaction_reference: z.string().nullish(),
});

export const ApprovePaymentSchema = z.object({
  payment_id: z.string().uuid(),
  approval_status: z.enum(['approved', 'rejected', 'void']),
  approval_notes: z.string().nullish(),
});

export const UpdatePaymentAmountSchema = z.object({
  payment_id: z.string().uuid(),
  amount_charged: z.number().min(0),
});

export const SetAmountAndApprovePaymentSchema = z.object({
  payment_id: z.string().uuid(),
  amount_charged: z.number().min(0),
  approval_notes: z.string().nullish(),
});

// Updated — uses line_items array instead of single description + amount
export const CreateManualChargeSchema = z.object({
  patient_id: z.string().uuid(),
  line_items: z.array(LineItemInputSchema).min(1, 'At least one item is required'),
  approval_notes: z.string().nullish(),
});

export const PaymentFilterSchema = z.object({
  approval_status: z.string().optional(),
  payment_status: z.string().optional(),
  is_overdue: z.boolean().optional(),
  patient_id: z.string().uuid().optional(),
});

export const PaymentCollectionFilterSchema = z.object({
  payment_id: z.string().uuid().optional(),
  payment_method: z.string().optional(),
  start_date: z.date().optional(),
  end_date: z.date().optional(),
});