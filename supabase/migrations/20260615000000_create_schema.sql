-- ============================================================================
-- Clinic Management Platform - Database Schema Migration (Corrected)
-- Created: 2026-06-15
-- Fixes: gen_random_uuid() instead of uuid_generate_v4(); appointments
--        table created before medical_records (FK dependency order)
-- ============================================================================

-- ============================================================================
-- 1. ORGANIZATIONAL LAYER
-- ============================================================================

-- Clinics table: tenant root
CREATE TABLE clinics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  address TEXT,
  city VARCHAR(100),
  state VARCHAR(100),
  postal_code VARCHAR(20),
  country VARCHAR(100) DEFAULT 'India',
  phone VARCHAR(20),
  email VARCHAR(255),
  license_number VARCHAR(100),

  -- Settings
  timezone VARCHAR(100) DEFAULT 'Asia/Kolkata',

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  CONSTRAINT clinic_email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$' OR email IS NULL)
);

CREATE INDEX idx_clinics_name ON clinics(name);
CREATE INDEX idx_clinics_email ON clinics(email);

-- Users table: auth + role management
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,

  -- Clerk auth integration
  clerk_id VARCHAR(255) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL,

  -- User info
  full_name VARCHAR(255) NOT NULL,
  phone VARCHAR(20),

  -- Role: doctor, staff, patient
  role VARCHAR(50) NOT NULL,
  CONSTRAINT valid_role CHECK (role IN ('doctor', 'staff', 'patient')),

  -- Doctor-specific fields
  license_number VARCHAR(100),
  specialization VARCHAR(255),

  -- Soft delete
  deleted_at TIMESTAMP WITH TIME ZONE,

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(clinic_id, email)
);

CREATE INDEX idx_users_clinic_id ON users(clinic_id);
CREATE INDEX idx_users_clerk_id ON users(clerk_id);
CREATE INDEX idx_users_role ON users(clinic_id, role);
CREATE INDEX idx_users_deleted_at ON users(deleted_at);

-- ============================================================================
-- 2. PATIENT & CARE LAYER
-- ============================================================================

-- Patients table: patient identity (the spine)
CREATE TABLE patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,

  -- Personal info
  first_name VARCHAR(255) NOT NULL,
  last_name VARCHAR(255) NOT NULL,
  date_of_birth DATE,
  gender VARCHAR(20),
  CONSTRAINT valid_gender CHECK (gender IN ('male', 'female', 'other', NULL)),

  -- Contact
  email VARCHAR(255),
  phone VARCHAR(20) NOT NULL,

  -- Address
  address TEXT,
  city VARCHAR(100),
  state VARCHAR(100),
  postal_code VARCHAR(20),

  -- Emergency contact
  emergency_contact_name VARCHAR(255),
  emergency_contact_phone VARCHAR(20),
  emergency_contact_relationship VARCHAR(100),

  -- Patient ID (clinic-specific)
  patient_id_number VARCHAR(100),

  -- Soft delete
  deleted_at TIMESTAMP WITH TIME ZONE,

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(clinic_id, patient_id_number)
);

CREATE INDEX idx_patients_clinic_id ON patients(clinic_id);
CREATE INDEX idx_patients_phone ON patients(clinic_id, phone);
CREATE INDEX idx_patients_email ON patients(clinic_id, email);
CREATE INDEX idx_patients_deleted_at ON patients(deleted_at);

-- Care Plans table: manual care instructions (medicines, follow-ups, suggestions, reminders)
CREATE TABLE care_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,

  -- Care plan metadata
  version INT DEFAULT 1,
  is_current BOOLEAN DEFAULT TRUE,
  status VARCHAR(50) DEFAULT 'active',
  CONSTRAINT valid_care_plan_status CHECK (status IN ('active', 'inactive', 'archived')),

  -- Core care instructions (JSON arrays)
  medicines JSONB DEFAULT '[]'::jsonb,
  -- Structure: { medicine_name, dosage, dosage_unit, frequency, duration_days, start_date, notes }

  follow_ups JSONB DEFAULT '[]'::jsonb,
  -- Structure: { follow_up_date, follow_up_type, notes, created_by_doctor }

  suggestions JSONB DEFAULT '[]'::jsonb,
  -- Structure: { category (diet/lifestyle/activity), suggestion_text, priority }

  reminder_definitions JSONB DEFAULT '[]'::jsonb,
  -- Structure: { reminder_type (medication/appointment/follow_up), trigger_date, days_before, enabled }

  -- Audit trail
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Soft delete
  deleted_at TIMESTAMP WITH TIME ZONE,

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_care_plans_clinic_id ON care_plans(clinic_id);
CREATE INDEX idx_care_plans_patient_id ON care_plans(patient_id);
CREATE INDEX idx_care_plans_is_current ON care_plans(patient_id, is_current);
CREATE INDEX idx_care_plans_status ON care_plans(status);
CREATE INDEX idx_care_plans_deleted_at ON care_plans(deleted_at);

-- ============================================================================
-- 3. APPOINTMENT LAYER
-- ============================================================================

-- Appointments table: clinic scheduling
CREATE TABLE appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  doctor_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,

  -- Appointment details
  appointment_date TIMESTAMP WITH TIME ZONE NOT NULL,
  duration_minutes INT DEFAULT 30,

  -- Status: scheduled, completed, cancelled, no_show
  status VARCHAR(50) NOT NULL DEFAULT 'scheduled',
  CONSTRAINT valid_appointment_status CHECK (status IN ('scheduled', 'completed', 'cancelled', 'no_show')),

  -- Notes
  chief_complaint TEXT,
  doctor_notes TEXT,

  -- Soft delete
  deleted_at TIMESTAMP WITH TIME ZONE,

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_appointments_clinic_id ON appointments(clinic_id);
CREATE INDEX idx_appointments_patient_id ON appointments(patient_id);
CREATE INDEX idx_appointments_doctor_id ON appointments(doctor_id);
CREATE INDEX idx_appointments_date ON appointments(clinic_id, appointment_date DESC);
CREATE INDEX idx_appointments_status ON appointments(clinic_id, status);
CREATE INDEX idx_appointments_deleted_at ON appointments(deleted_at);

-- ============================================================================
-- 4. CLINICAL RECORDS LAYER
-- ============================================================================

-- Medical Records table: consultation notes, diagnoses, test results, prescriptions
CREATE TABLE medical_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,

  -- Link to appointment (if from a consultation)
  appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,

  -- Record type
  record_type VARCHAR(50) NOT NULL,
  CONSTRAINT valid_record_type CHECK (record_type IN ('consultation', 'test_result', 'prescription', 'diagnosis')),

  -- Clinical content
  title VARCHAR(255),
  description TEXT,

  -- Structured data (if applicable)
  data JSONB,

  -- Doctor who created this
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Record date
  consultation_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Soft delete
  deleted_at TIMESTAMP WITH TIME ZONE,

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_medical_records_clinic_id ON medical_records(clinic_id);
CREATE INDEX idx_medical_records_patient_id ON medical_records(patient_id);
CREATE INDEX idx_medical_records_appointment_id ON medical_records(appointment_id);
CREATE INDEX idx_medical_records_type ON medical_records(clinic_id, record_type);
CREATE INDEX idx_medical_records_date ON medical_records(clinic_id, consultation_date DESC);
CREATE INDEX idx_medical_records_deleted_at ON medical_records(deleted_at);

-- ============================================================================
-- 5. ENGAGEMENT LAYER
-- ============================================================================

-- Reminders table: sent reminder records (audit trail + analytics)
CREATE TABLE reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,

  -- Reference (appointment, follow-up, medication)
  appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
  care_plan_id UUID REFERENCES care_plans(id) ON DELETE SET NULL,

  -- Reminder type
  reminder_type VARCHAR(50) NOT NULL,
  CONSTRAINT valid_reminder_type CHECK (reminder_type IN ('medication', 'appointment', 'follow_up')),

  -- Delivery channel
  channel VARCHAR(50) DEFAULT 'whatsapp',
  CONSTRAINT valid_channel CHECK (channel IN ('whatsapp', 'sms', 'email')),

  -- Status
  status VARCHAR(50) DEFAULT 'sent',
  CONSTRAINT valid_reminder_status CHECK (status IN ('pending', 'sent', 'failed', 'delivered')),

  -- Message content
  message_content TEXT,

  -- Timestamps
  sent_at TIMESTAMP WITH TIME ZONE,
  delivered_at TIMESTAMP WITH TIME ZONE,

  -- Soft delete
  deleted_at TIMESTAMP WITH TIME ZONE,

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_reminders_clinic_id ON reminders(clinic_id);
CREATE INDEX idx_reminders_patient_id ON reminders(patient_id);
CREATE INDEX idx_reminders_appointment_id ON reminders(appointment_id);
CREATE INDEX idx_reminders_type ON reminders(clinic_id, reminder_type);
CREATE INDEX idx_reminders_status ON reminders(clinic_id, status);
CREATE INDEX idx_reminders_sent_at ON reminders(clinic_id, sent_at DESC);
CREATE INDEX idx_reminders_deleted_at ON reminders(deleted_at);

-- ============================================================================
-- 6. PAYMENT LAYER
-- ============================================================================

-- Payments table: transaction records
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,

  -- Link to appointment (optional)
  appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,

  -- Amount (stored as cents: 15000 = ₹150)
  amount_cents INT NOT NULL,
  CONSTRAINT positive_amount CHECK (amount_cents > 0),

  -- Currency
  currency VARCHAR(3) DEFAULT 'INR',

  -- Payment status: pending, approved_by_doctor, rejected, completed
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  CONSTRAINT valid_payment_status CHECK (status IN ('pending', 'approved_by_doctor', 'rejected', 'completed')),

  -- Payment method
  payment_method VARCHAR(50),
  CONSTRAINT valid_payment_method CHECK (payment_method IN ('cash', 'card', 'bank_transfer', 'upi', NULL)),

  -- Approval by doctor
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  approval_reason TEXT,

  -- Soft delete
  deleted_at TIMESTAMP WITH TIME ZONE,

  -- Key timestamps
  paid_at TIMESTAMP WITH TIME ZONE,
  approved_at TIMESTAMP WITH TIME ZONE,

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_payments_clinic_id ON payments(clinic_id);
CREATE INDEX idx_payments_patient_id ON payments(patient_id);
CREATE INDEX idx_payments_appointment_id ON payments(appointment_id);
CREATE INDEX idx_payments_status ON payments(clinic_id, status);
CREATE INDEX idx_payments_created_at ON payments(clinic_id, created_at DESC);
CREATE INDEX idx_payments_paid_at ON payments(clinic_id, paid_at DESC);
CREATE INDEX idx_payments_deleted_at ON payments(deleted_at);

-- ============================================================================
-- 7. DOCUMENT LAYER
-- ============================================================================

-- Generated Documents table: PDFs, receipts, treatment summaries
CREATE TABLE generated_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,

  -- Link to payment (optional)
  payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,

  -- Document type
  document_type VARCHAR(50) NOT NULL,
  CONSTRAINT valid_document_type CHECK (document_type IN ('receipt', 'treatment_summary', 'prescription_sheet', 'invoice')),

  -- File reference
  file_path VARCHAR(500),
  file_size_bytes INT,
  file_mime_type VARCHAR(100),

  -- Generated metadata
  generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE,

  -- Archived (for retention policy)
  archived_at TIMESTAMP WITH TIME ZONE,

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_generated_documents_clinic_id ON generated_documents(clinic_id);
CREATE INDEX idx_generated_documents_patient_id ON generated_documents(patient_id);
CREATE INDEX idx_generated_documents_payment_id ON generated_documents(payment_id);
CREATE INDEX idx_generated_documents_type ON generated_documents(clinic_id, document_type);
CREATE INDEX idx_generated_documents_generated_at ON generated_documents(clinic_id, generated_at DESC);
CREATE INDEX idx_generated_documents_archived_at ON generated_documents(archived_at);

-- ============================================================================
-- 8. ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE clinics ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE care_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE medical_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE generated_documents ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- CLINICS RLS
-- ============================================================================

CREATE POLICY "users_view_own_clinic" ON clinics
  FOR SELECT USING (
    auth.uid() IN (
      SELECT id FROM users WHERE clinic_id = clinics.id AND deleted_at IS NULL
    )
  );

CREATE POLICY "clinics_insert_restrict" ON clinics
  FOR INSERT WITH CHECK (false);

CREATE POLICY "clinics_update_restrict" ON clinics
  FOR UPDATE USING (false);

-- ============================================================================
-- USERS RLS
-- ============================================================================

CREATE POLICY "users_view_clinic_users" ON users
  FOR SELECT USING (
    clinic_id IN (
      SELECT clinic_id FROM users WHERE id = auth.uid() AND deleted_at IS NULL
    ) AND deleted_at IS NULL
  );

CREATE POLICY "users_insert_own_clinic" ON users
  FOR INSERT WITH CHECK (
    clinic_id IN (
      SELECT clinic_id FROM users WHERE id = auth.uid() AND deleted_at IS NULL
    )
  );

CREATE POLICY "users_update_own_clinic" ON users
  FOR UPDATE USING (
    clinic_id IN (
      SELECT clinic_id FROM users WHERE id = auth.uid() AND deleted_at IS NULL
    )
  );

-- ============================================================================
-- PATIENTS RLS
-- ============================================================================

CREATE POLICY "staff_view_clinic_patients" ON patients
  FOR SELECT USING (
    clinic_id IN (
      SELECT clinic_id FROM users
      WHERE id = auth.uid() AND role IN ('doctor', 'staff') AND deleted_at IS NULL
    ) AND deleted_at IS NULL
  );

CREATE POLICY "patient_view_own_record" ON patients
  FOR SELECT USING (
    id IN (
      SELECT patient_id FROM appointments
      WHERE patient_id = ANY(
        ARRAY(SELECT id FROM patients WHERE clinic_id = patients.clinic_id)
      )
    )
    OR
    id IN (
      SELECT id FROM patients
      WHERE clinic_id IN (
        SELECT clinic_id FROM users WHERE id = auth.uid() AND role = 'patient'
      )
    )
  );

CREATE POLICY "staff_insert_patients" ON patients
  FOR INSERT WITH CHECK (
    clinic_id IN (
      SELECT clinic_id FROM users
      WHERE id = auth.uid() AND role IN ('doctor', 'staff') AND deleted_at IS NULL
    )
  );

CREATE POLICY "staff_update_patients" ON patients
  FOR UPDATE USING (
    clinic_id IN (
      SELECT clinic_id FROM users
      WHERE id = auth.uid() AND role IN ('doctor', 'staff') AND deleted_at IS NULL
    )
  );

-- ============================================================================
-- CARE PLANS RLS
-- ============================================================================

CREATE POLICY "staff_view_care_plans" ON care_plans
  FOR SELECT USING (
    clinic_id IN (
      SELECT clinic_id FROM users
      WHERE id = auth.uid() AND role IN ('doctor', 'staff') AND deleted_at IS NULL
    ) AND deleted_at IS NULL
  );

CREATE POLICY "patient_view_own_care_plans" ON care_plans
  FOR SELECT USING (
    patient_id IN (
      SELECT id FROM patients
      WHERE clinic_id IN (
        SELECT clinic_id FROM users WHERE id = auth.uid() AND role = 'patient'
      )
    ) AND deleted_at IS NULL
  );

CREATE POLICY "staff_insert_care_plans" ON care_plans
  FOR INSERT WITH CHECK (
    clinic_id IN (
      SELECT clinic_id FROM users
      WHERE id = auth.uid() AND role IN ('doctor', 'staff') AND deleted_at IS NULL
    )
  );

CREATE POLICY "staff_update_care_plans" ON care_plans
  FOR UPDATE USING (
    clinic_id IN (
      SELECT clinic_id FROM users
      WHERE id = auth.uid() AND role IN ('doctor', 'staff') AND deleted_at IS NULL
    )
  );

-- ============================================================================
-- MEDICAL RECORDS RLS
-- ============================================================================

CREATE POLICY "staff_view_medical_records" ON medical_records
  FOR SELECT USING (
    clinic_id IN (
      SELECT clinic_id FROM users
      WHERE id = auth.uid() AND role IN ('doctor', 'staff') AND deleted_at IS NULL
    ) AND deleted_at IS NULL
  );

CREATE POLICY "patient_view_own_medical_records" ON medical_records
  FOR SELECT USING (
    patient_id IN (
      SELECT id FROM patients
      WHERE clinic_id IN (
        SELECT clinic_id FROM users WHERE id = auth.uid() AND role = 'patient'
      )
    ) AND deleted_at IS NULL
  );

CREATE POLICY "doctor_insert_medical_records" ON medical_records
  FOR INSERT WITH CHECK (
    clinic_id IN (
      SELECT clinic_id FROM users
      WHERE id = auth.uid() AND role = 'doctor' AND deleted_at IS NULL
    )
  );

CREATE POLICY "doctor_update_medical_records" ON medical_records
  FOR UPDATE USING (
    clinic_id IN (
      SELECT clinic_id FROM users
      WHERE id = auth.uid() AND role = 'doctor' AND deleted_at IS NULL
    )
  );

-- ============================================================================
-- APPOINTMENTS RLS
-- ============================================================================

CREATE POLICY "doctor_view_appointments" ON appointments
  FOR SELECT USING (
    clinic_id IN (
      SELECT clinic_id FROM users
      WHERE id = auth.uid() AND role = 'doctor' AND deleted_at IS NULL
    ) AND deleted_at IS NULL
  );

CREATE POLICY "staff_view_appointments" ON appointments
  FOR SELECT USING (
    clinic_id IN (
      SELECT clinic_id FROM users
      WHERE id = auth.uid() AND role = 'staff' AND deleted_at IS NULL
    ) AND deleted_at IS NULL
  );

CREATE POLICY "patient_view_own_appointments" ON appointments
  FOR SELECT USING (
    patient_id IN (
      SELECT id FROM patients
      WHERE clinic_id IN (
        SELECT clinic_id FROM users WHERE id = auth.uid() AND role = 'patient'
      )
    ) AND deleted_at IS NULL
  );

CREATE POLICY "staff_insert_appointments" ON appointments
  FOR INSERT WITH CHECK (
    clinic_id IN (
      SELECT clinic_id FROM users
      WHERE id = auth.uid() AND role IN ('doctor', 'staff') AND deleted_at IS NULL
    )
  );

CREATE POLICY "staff_update_appointments" ON appointments
  FOR UPDATE USING (
    clinic_id IN (
      SELECT clinic_id FROM users
      WHERE id = auth.uid() AND role IN ('doctor', 'staff') AND deleted_at IS NULL
    )
  );

-- ============================================================================
-- REMINDERS RLS
-- ============================================================================

CREATE POLICY "staff_view_reminders" ON reminders
  FOR SELECT USING (
    clinic_id IN (
      SELECT clinic_id FROM users
      WHERE id = auth.uid() AND role IN ('doctor', 'staff') AND deleted_at IS NULL
    ) AND deleted_at IS NULL
  );

CREATE POLICY "patient_view_own_reminders" ON reminders
  FOR SELECT USING (
    patient_id IN (
      SELECT id FROM patients
      WHERE clinic_id IN (
        SELECT clinic_id FROM users WHERE id = auth.uid() AND role = 'patient'
      )
    ) AND deleted_at IS NULL
  );

CREATE POLICY "staff_insert_reminders" ON reminders
  FOR INSERT WITH CHECK (
    clinic_id IN (
      SELECT clinic_id FROM users
      WHERE id = auth.uid() AND role IN ('doctor', 'staff') AND deleted_at IS NULL
    )
  );

-- ============================================================================
-- PAYMENTS RLS
-- ============================================================================

CREATE POLICY "doctor_view_payments" ON payments
  FOR SELECT USING (
    clinic_id IN (
      SELECT clinic_id FROM users
      WHERE id = auth.uid() AND role = 'doctor' AND deleted_at IS NULL
    ) AND deleted_at IS NULL
  );

CREATE POLICY "staff_view_payments" ON payments
  FOR SELECT USING (
    clinic_id IN (
      SELECT clinic_id FROM users
      WHERE id = auth.uid() AND role = 'staff' AND deleted_at IS NULL
    ) AND deleted_at IS NULL
  );

CREATE POLICY "patient_view_own_payments" ON payments
  FOR SELECT USING (
    patient_id IN (
      SELECT id FROM patients
      WHERE clinic_id IN (
        SELECT clinic_id FROM users WHERE id = auth.uid() AND role = 'patient'
      )
    ) AND deleted_at IS NULL
  );

CREATE POLICY "staff_insert_payments" ON payments
  FOR INSERT WITH CHECK (
    clinic_id IN (
      SELECT clinic_id FROM users
      WHERE id = auth.uid() AND role IN ('doctor', 'staff') AND deleted_at IS NULL
    )
  );

CREATE POLICY "staff_update_payments" ON payments
  FOR UPDATE USING (
    clinic_id IN (
      SELECT clinic_id FROM users
      WHERE id = auth.uid() AND role IN ('doctor', 'staff') AND deleted_at IS NULL
    )
  );

-- ============================================================================
-- GENERATED DOCUMENTS RLS
-- ============================================================================

CREATE POLICY "staff_view_documents" ON generated_documents
  FOR SELECT USING (
    clinic_id IN (
      SELECT clinic_id FROM users
      WHERE id = auth.uid() AND role IN ('doctor', 'staff') AND deleted_at IS NULL
    )
  );

CREATE POLICY "patient_view_own_documents" ON generated_documents
  FOR SELECT USING (
    patient_id IN (
      SELECT id FROM patients
      WHERE clinic_id IN (
        SELECT clinic_id FROM users WHERE id = auth.uid() AND role = 'patient'
      )
    )
  );

CREATE POLICY "staff_insert_documents" ON generated_documents
  FOR INSERT WITH CHECK (
    clinic_id IN (
      SELECT clinic_id FROM users
      WHERE id = auth.uid() AND role IN ('doctor', 'staff') AND deleted_at IS NULL
    )
  );

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================