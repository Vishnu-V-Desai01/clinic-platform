// src/features/payments/types.ts

/**
 * Payment: one row per charge — either auto-created when an appointment is
 * marked completed, or manually created by a doctor for ad-hoc charges
 * (walk-ins, lab-only visits) that have no appointment behind them.
 */
export interface Payment {
  id: string;
  clinic_id: string;
  patient_id: string;
  appointment_id: string | null; // null for manual/ad-hoc charges

  // Charge details
  amount_charged: number;
  amount_paid: number; // Cumulative sum of all collections

  // Label for manual charges (required when appointment_id is null)
  description: string | null;

  // Generated columns (deterministic, always in sync)
  outstanding_balance: number; // amount_charged - amount_paid
  payment_status: 'unpaid' | 'partial' | 'paid';

  // Approval gate (doctor-only)
  approval_status: 'pending' | 'approved' | 'rejected' | 'void';
  approved_by: string | null; // FK to profiles.id
  approved_at: string | null; // ISO timestamp
  approval_notes: string | null;

  // Reconciliation flag (maintained by trigger)
  is_overdue: boolean; // true if unpaid/partial AND created_at > 30 days ago

  // Audit
  created_at: string; // ISO timestamp
  updated_at: string; // ISO timestamp
  created_by: string; // FK to profiles.id
}

/**
 * PaymentCollection: one row per collection event.
 * Cumulative collections update Payment.amount_paid via trigger.
 */
export interface PaymentCollection {
  id: string;
  clinic_id: string;
  payment_id: string;

  // Collection details
  amount_collected: number;
  collection_date: string; // ISO timestamp
  payment_method: 'cash' | 'card' | 'upi' | 'bank_transfer' | 'check' | 'other';
  transaction_reference: string | null; // e.g., UPI ID, check number, invoice ref
  collected_by: string; // FK to profiles.id
  notes: string | null;

  // Audit
  created_at: string; // ISO timestamp
  updated_at: string; // ISO timestamp
}

/**
 * PaymentWithCollections: Payment joined with its collection history.
 * Used in detail views and reconciliation.
 */
export interface PaymentWithCollections extends Payment {
  payment_collections?: PaymentCollection[];
}

/**
 * Document: immutable record of generated PDF (receipt or treatment details).
 * Linked to payment; stored in Supabase Storage.
 * Write-once, read-many; cannot be updated or deleted.
 */
export interface Document {
  id: string;
  clinic_id: string;
  payment_id: string;
  patient_id: string;

  // Document metadata
  document_type: 'receipt' | 'treatment_details';
  file_name: string; // e.g., "receipt_CLI-2026-000001.pdf"
  file_path: string; // Supabase Storage path
  file_size_bytes: number | null;
  mime_type: string; // e.g., "application/pdf"

  // State
  is_final: boolean; // Always true; documents are immutable

  // Audit (immutable)
  created_at: string; // ISO timestamp
  created_by: string; // FK to profiles.id
}

/**
 * PaymentAlert: reconciliation snapshot for overdue/outstanding payments.
 * Generated deterministically by scheduled job; not editable by users.
 */
export interface PaymentAlert {
  id: string;
  clinic_id: string;
  payment_id: string;
  patient_id: string;
  appointment_id: string;

  // Snapshot of payment state at alert time
  amount_charged: number;
  amount_paid: number;
  outstanding_balance: number;
  payment_status: 'unpaid' | 'partial' | 'paid';

  // Alert classification
  alert_type: 'overdue_unpaid' | 'overdue_partial';
  days_overdue: number;
  escalation_level: 'warning' | 'urgent'; // warning: 30-60 days, urgent: > 60 days

  // Audit
  alert_created_at: string; // ISO timestamp (when alert was generated)
  resolved_at: string | null; // ISO timestamp (when payment was settled)
}

/**
 * PaymentStats: aggregated payment metrics for a clinic.
 * Used in dashboard and reporting.
 */
export interface PaymentStats {
  total_charged: number;
  total_collected: number;
  total_outstanding: number;
  count_paid: number;
  count_partial: number;
  count_unpaid: number;
  count_overdue: number;
  average_days_to_collection: number;
}

/**
 * PaymentListItem: simplified payment view for tables and lists.
 */
export interface PaymentListItem {
  id: string;
  patient_id: string;
  patient_name: string; // Joined from patients table
  appointment_id: string;
  appointment_datetime: string; // ISO timestamp, joined from appointments
  amount_charged: number;
  amount_paid: number;
  outstanding_balance: number;
  payment_status: 'unpaid' | 'partial' | 'paid';
  approval_status: 'pending' | 'approved' | 'rejected' | 'void';
  is_overdue: boolean;
  created_at: string;
  doctor_name: string; // Joined from profiles (created_by)
}

// ─────────────────────────────────────────────────────────────────
// View models for the Payments UI (Charge Approvals, Dashboard).
// These are derived/joined shapes returned by query functions in
// actions.ts; they are NOT raw DB rows. Amounts are in PAISE
// (integer, ₹ × 100) for precision-safe UI math.
// ─────────────────────────────────────────────────────────────────

export interface PendingChargeView {
  id: string;
  patientName: string;
  patientMrn: string;
  service: string; // appointment_type, or description for manual charges
  date: string; // ISO timestamp
  proposedAmountPaise: number; // 0 if doctor hasn't set a fee yet
}

export interface ApprovedChargeView {
  id: string;
  patientName: string;
  patientMrn: string;
  service: string;
  amountDuePaise: number; // outstanding_balance * 100
}

export type PaymentDisplayStatus =
  | 'Pending Approval'
  | 'Unpaid'
  | 'Partially Paid'
  | 'Paid'
  | 'Rejected'
  | 'Void';

export interface PaymentDashboardRow {
  id: string;
  patientName: string;
  patientMrn: string;
  service: string;
  date: string;
  amountPaise: number;
  paidPaise: number;
  outstandingPaise: number;
  mode: string | null; // label of most recent collection method
  status: PaymentDisplayStatus;
  hasReceipt: boolean;
}

export interface PaymentDashboardMetrics {
  totalCollectedPaise: number;
  outstandingPaise: number;
  pendingApprovalPaise: number;
  collectedTodayPaise: number;
}

export interface PaymentDashboardByMode {
  cashPaise: number;
  cardPaise: number;
  upiPaise: number;
  bankPaise: number;
}

/**
 * PatientPickerItem: minimal patient shape for the "New Charge" patient
 * combobox. Doctor-only feature for ad-hoc charges (walk-ins, lab-only
 * visits) that have no appointment behind them.
 */
export interface PatientPickerItem {
  id: string;
  name: string;
  mrn: string;
}