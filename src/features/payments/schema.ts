// src/features/payments/schema.ts

import { z } from 'zod';

/**
 * Validation schema for creating a payment.
 * Called by the doctor approval action.
 * appointment_id is auto-populated; doctor sets amount_charged.
 */
export const CreatePaymentSchema = z.object({
  appointment_id: z.string().uuid('Invalid appointment ID'),
  amount_charged: z
    .number()
    .positive('Amount must be greater than 0')
    .max(999999.99, 'Amount exceeds maximum allowed'),
  approval_notes: z.string().optional().nullable(),
});

export type CreatePaymentInput = z.infer<typeof CreatePaymentSchema>;

/**
 * Validation schema for recording a payment collection.
 * Staff member logs a collection against a payment.
 */
export const CreatePaymentCollectionSchema = z.object({
  payment_id: z.string().uuid('Invalid payment ID'),
  amount_collected: z
    .number()
    .positive('Amount must be greater than 0')
    .max(999999.99, 'Amount exceeds maximum allowed'),
  collection_date: z.coerce.date('Invalid collection date'),
  payment_method: z.enum(
    ['cash', 'card', 'upi', 'bank_transfer', 'check', 'other'],
    {
      message: 'Invalid payment method',
    }
  ),
  transaction_reference: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export type CreatePaymentCollectionInput = z.infer<typeof CreatePaymentCollectionSchema>;

/**
 * Validation schema for updating a payment collection.
 * Can only edit amount_collected, notes, and transaction_reference.
 * collection_date and payment_method are immutable after creation.
 */
export const UpdatePaymentCollectionSchema = z.object({
  id: z.string().uuid('Invalid collection ID'),
  amount_collected: z
    .number()
    .positive('Amount must be greater than 0')
    .max(999999.99, 'Amount exceeds maximum allowed'),
  notes: z.string().optional().nullable(),
  transaction_reference: z.string().optional().nullable(),
});

export type UpdatePaymentCollectionInput = z.infer<typeof UpdatePaymentCollectionSchema>;

/**
 * Validation schema for doctor approval of a payment.
 * Doctor can approve, reject, or void a pending payment.
 */
export const ApprovePaymentSchema = z.object({
  payment_id: z.string().uuid('Invalid payment ID'),
  approval_status: z.enum(['approved', 'rejected', 'void'], {
    message: 'Invalid approval status',
  }),
  approval_notes: z.string().optional().nullable(),
});

export type ApprovePaymentInput = z.infer<typeof ApprovePaymentSchema>;

/**
 * Validation schema for doctor to set/update amount_charged on a payment.
 * Used when the fee changes or needs correction before approval.
 */
export const UpdatePaymentAmountSchema = z.object({
  payment_id: z.string().uuid('Invalid payment ID'),
  amount_charged: z
    .number()
    .positive('Amount must be greater than 0')
    .max(999999.99, 'Amount exceeds maximum allowed'),
});

export type UpdatePaymentAmountInput = z.infer<typeof UpdatePaymentAmountSchema>;

/**
 * Combined schema: doctor sets the fee AND approves in a single step.
 * Used by the Charge Approvals screen ("Set & Approve" button) for
 * payments auto-created from a completed appointment.
 */
export const SetAmountAndApprovePaymentSchema = z.object({
  payment_id: z.string().uuid('Invalid payment ID'),
  amount_charged: z
    .number()
    .positive('Amount must be greater than 0')
    .max(999999.99, 'Amount exceeds maximum allowed'),
  approval_notes: z.string().optional().nullable(),
});

export type SetAmountAndApprovePaymentInput = z.infer<typeof SetAmountAndApprovePaymentSchema>;

/**
 * Schema for a doctor-created ad-hoc charge with no linked appointment
 * (e.g. walk-ins, lab-only visits). Created already approved, since the
 * doctor sets the amount and approves in the same step.
 */
export const CreateManualChargeSchema = z.object({
  patient_id: z.string().uuid('Invalid patient ID'),
  description: z
    .string()
    .min(1, 'Description is required')
    .max(200, 'Description is too long'),
  amount_charged: z
    .number()
    .positive('Amount must be greater than 0')
    .max(999999.99, 'Amount exceeds maximum allowed'),
  approval_notes: z.string().optional().nullable(),
});

export type CreateManualChargeInput = z.infer<typeof CreateManualChargeSchema>;

/**
 * Validation schema for filtering/querying payments.
 * Used in list views and reconciliation reports.
 */
export const PaymentFilterSchema = z.object({
  approval_status: z
    .enum(['pending', 'approved', 'rejected', 'void'])
    .optional(),
  payment_status: z.enum(['unpaid', 'partial', 'paid']).optional(),
  is_overdue: z.boolean().optional(),
  patient_id: z.string().uuid().optional(),
  start_date: z.coerce.date().optional(),
  end_date: z.coerce.date().optional(),
});

export type PaymentFilterInput = z.infer<typeof PaymentFilterSchema>;

/**
 * Validation schema for querying payment collections.
 */
export const PaymentCollectionFilterSchema = z.object({
  payment_id: z.string().uuid().optional(),
  payment_method: z
    .enum(['cash', 'card', 'upi', 'bank_transfer', 'check', 'other'])
    .optional(),
  start_date: z.coerce.date().optional(),
  end_date: z.coerce.date().optional(),
});

export type PaymentCollectionFilterInput = z.infer<typeof PaymentCollectionFilterSchema>;