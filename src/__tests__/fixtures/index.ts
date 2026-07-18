/**
 * Test fixtures and builders
 * Reusable functions to create test data for clinics, users, patients, appointments, etc.
 */

import { v4 as uuidv4 } from 'uuid'
import type { Profile, Role } from '../../lib/supabase/profile'

export const TEST_CLINIC_ID = '11111111-1111-1111-1111-111111111111'
export const TEST_DOCTOR_ID = '874ad51a-b42d-4ac8-b988-55ac10645308'
export const TEST_STAFF_ID = 'staff-test-id-001'
export const TEST_PATIENT_ID = 'patient-test-id-001'

// ============================================================
// Profile fixtures — matches the REAL Profile type in
// src/lib/supabase/profile.ts, updated for the new onboarding model
// (getOrCreateProfile no longer auto-creates; clinic_id is nullable;
// is_clinic_admin/staff_type/status are new fields).
// This is the one fixture below that's actually confirmed correct.
// ============================================================
export const createTestProfile = (overrides?: Partial<Profile>): Profile => ({
  id: TEST_DOCTOR_ID,
  clerk_user_id: 'test-clerk-user-id',
  email: 'doctor@test.clinic',
  full_name: 'Dr. Test',
  role: 'doctor' as Role,
  clinic_id: TEST_CLINIC_ID,
  is_clinic_admin: false,
  has_admin_onboarded: false,
  staff_type: null,
  status: 'active',
  ...overrides,
})

// ============================================================
// NOTE: everything below (Clinic, Doctor, Staff, Patient records,
// Appointment, Medical Record, Consent, Care Plan, Payment) was
// scaffolded in Step 1 before any real table/schema shape had been
// confirmed. Today it's only exercised by Step 1's own fixture
// meta-tests. Before any future step relies on these against real
// code, verify field names against the actual Supabase schema first
// — the same way createTestProfile above was verified against the
// real Profile type.
// ============================================================

// Clinic fixtures
export const createTestClinic = (overrides?: Partial<any>) => ({
  id: TEST_CLINIC_ID,
  name: 'Test Clinic',
  hfr_id: null,
  address: '123 Health St, Chennai',
  phone: '+91 98765 43210',
  city: 'Chennai',
  state: 'Tamil Nadu',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...overrides,
})

// Doctor/Profile fixtures
export const createTestDoctor = (overrides?: Partial<any>) => ({
  id: TEST_DOCTOR_ID,
  clinic_id: TEST_CLINIC_ID,
  user_id: 'doctor-clerk-id',
  email: 'doctor@test.clinic',
  first_name: 'Dr.',
  last_name: 'Test',
  role: 'doctor',
  hpr_id: null,
  abha_number: null,
  status: 'active',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...overrides,
})

// Staff fixtures
export const createTestStaff = (overrides?: Partial<any>) => ({
  id: TEST_STAFF_ID,
  clinic_id: TEST_CLINIC_ID,
  user_id: 'staff-clerk-id',
  email: 'staff@test.clinic',
  first_name: 'Staff',
  last_name: 'Test',
  role: 'staff',
  status: 'active',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...overrides,
})

// Patient fixtures
export const createTestPatient = (overrides?: Partial<any>) => ({
  id: TEST_PATIENT_ID,
  clinic_id: TEST_CLINIC_ID,
  first_name: 'Patient',
  last_name: 'Test',
  date_of_birth: '1990-01-15',
  gender: 'M',
  phone: '+91 98765 12345',
  email: 'patient@test.com',
  address: '456 Patient Ave, Chennai',
  emergency_contact_name: 'John Doe',
  emergency_contact_phone: '+91 98765 54321',
  abha_number: null,
  abha_address: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...overrides,
})

// Appointment fixtures
export const createTestAppointment = (overrides?: Partial<any>) => ({
  id: uuidv4(),
  clinic_id: TEST_CLINIC_ID,
  patient_id: TEST_PATIENT_ID,
  doctor_id: TEST_DOCTOR_ID,
  appointment_date: new Date(Date.now() + 86400000).toISOString().split('T')[0], // tomorrow
  appointment_time: '10:00',
  status: 'scheduled',
  notes: 'Regular checkup',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...overrides,
})

// Medical Record fixtures
export const createTestMedicalRecord = (overrides?: Partial<any>) => ({
  id: uuidv4(),
  clinic_id: TEST_CLINIC_ID,
  patient_id: TEST_PATIENT_ID,
  doctor_id: TEST_DOCTOR_ID,
  appointment_id: uuidv4(),
  record_type: 'consultation',
  code: null,
  code_system: null,
  title: 'Consultation Notes',
  content: 'Patient reports mild fever. BP normal.',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...overrides,
})

// Consent fixtures
export const createTestConsent = (overrides?: Partial<any>) => ({
  id: uuidv4(),
  clinic_id: TEST_CLINIC_ID,
  patient_id: TEST_PATIENT_ID,
  consent_type: 'data_processing',
  granted: true,
  revoked_at: null,
  metadata: {},
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...overrides,
})

// Care Plan fixtures
export const createTestCarePlan = (overrides?: Partial<any>) => ({
  id: uuidv4(),
  clinic_id: TEST_CLINIC_ID,
  patient_id: TEST_PATIENT_ID,
  doctor_id: TEST_DOCTOR_ID,
  title: 'Hypertension Management',
  description: 'Monitor BP daily, medication review in 2 weeks',
  status: 'active',
  start_date: new Date().toISOString().split('T')[0],
  end_date: new Date(Date.now() + 86400000 * 30).toISOString().split('T')[0], // 30 days
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...overrides,
})

// Payment fixtures
export const createTestPayment = (overrides?: Partial<any>) => ({
  id: uuidv4(),
  clinic_id: TEST_CLINIC_ID,
  patient_id: TEST_PATIENT_ID,
  appointment_id: uuidv4(),
  amount_paise: 50000, // ₹500 in paise
  payment_method: 'cash',
  status: 'pending',
  razorpay_order_id: null,
  razorpay_payment_id: null,
  notes: 'Consultation fee',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...overrides,
})

// Consent Audit Log fixtures
export const createTestConsentAuditLog = (overrides?: Partial<any>) => ({
  id: uuidv4(),
  clinic_id: TEST_CLINIC_ID,
  patient_id: TEST_PATIENT_ID,
  action: 'granted',
  consent_type: 'data_processing',
  changed_by: TEST_DOCTOR_ID,
  changed_by_role: 'doctor',
  ip_address: '127.0.0.1',
  created_at: new Date().toISOString(),
  ...overrides,
})