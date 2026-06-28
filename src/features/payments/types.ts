// src/features/payments/types.ts

export type Payment = {
  id: string;
  clinic_id: string;
  patient_id: string;
  appointment_id: string | null;
  description: string | null;
  amount_charged: number;
  amount_paid: number;
  outstanding_balance: number;
  payment_status: 'unpaid' | 'partial' | 'paid';
  approval_status: 'pending' | 'approved' | 'rejected' | 'void';
  approved_by: string | null;
  approved_at: string | null;
  approval_notes: string | null;
  receipt_number: string | null;
  is_overdue: boolean;
  created_by: string;
  created_at: string;
  updated_at: string | null;
};

export type PaymentCollection = {
  id: string;
  clinic_id: string;
  payment_id: string;
  amount_collected: number;
  collection_date: string;
  payment_method: 'cash' | 'card' | 'upi' | 'bank_transfer' | 'check' | 'other';
  transaction_reference: string | null;
  collected_by: string;
  notes: string | null;
  created_at: string;
  updated_at: string | null;
};

export type PaymentWithCollections = Payment & {
  payment_collections: PaymentCollection[];
};

export type PaymentLineItem = {
  id: string;
  clinic_id: string;
  payment_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  sort_order: number;
  created_at: string;
  updated_at: string | null;
};

export type Document = {
  id: string;
  clinic_id: string;
  payment_id: string;
  document_type: 'receipt' | 'treatment_details';
  file_path: string;
  file_name: string;
  file_size: number | null;
  mime_type: string | null;
  created_at: string;
};

export type PaymentAlert = {
  id: string;
  clinic_id: string;
  payment_id: string;
  alert_type: 'overdue_unpaid' | 'overdue_partial';
  days_overdue: number;
  escalation_level: 'warning' | 'urgent';
  alert_created_at: string;
  resolved_at: string | null;
};

export type PaymentListItem = {
  id: string;
  patient_id: string;
  patient_name: string;
  appointment_id: string | null;
  appointment_datetime: string;
  amount_charged: number;
  amount_paid: number;
  outstanding_balance: number;
  payment_status: string;
  approval_status: string;
  is_overdue: boolean;
  created_at: string;
  doctor_name: string;
};

export type PaymentStats = {
  totalCharged: number;
  totalCollected: number;
  totalOutstanding: number;
  paymentCount: number;
};

// ── Paise-based view models ───────────────────────────────────────────────────

export type PendingChargeView = {
  id: string;
  patientName: string;
  patientMrn: string;
  service: string;
  date: string;
  proposedAmountPaise: number;
  hasLineItems: boolean;
  lineItems: Array<{
    id: string;
    description: string;
    quantity: number;
    unit_price: number;
    total_price: number;
    sort_order: number;
  }>;
};

export type ApprovedChargeView = {
  id: string;
  patientName: string;
  patientMrn: string;
  service: string;
  amountDuePaise: number;
};

export type PaymentDisplayStatus =
  | 'Pending Approval'
  | 'Unpaid'
  | 'Partially Paid'
  | 'Paid'
  | 'Rejected'
  | 'Void';

export type PaymentDashboardRow = {
  id: string;
  patientName: string;
  patientMrn: string;
  service: string;
  date: string;
  amountPaise: number;
  paidPaise: number;
  outstandingPaise: number;
  mode: string | null;
  status: PaymentDisplayStatus;
  hasReceipt: boolean;
};

export type PaymentDashboardMetrics = {
  totalCollectedPaise: number;
  outstandingPaise: number;
  pendingApprovalPaise: number;
  collectedTodayPaise: number;
};

export type PaymentDashboardByMode = {
  cashPaise: number;
  cardPaise: number;
  upiPaise: number;
  bankPaise: number;
};

export type PatientPickerItem = {
  id: string;
  name: string;
  mrn: string;
};