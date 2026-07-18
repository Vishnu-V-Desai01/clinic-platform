/**
 * Test fixtures and helpers validation
 * Verifies that our test data builders and utilities work correctly
 */

import {
  TEST_CLINIC_ID,
  TEST_DOCTOR_ID,
  TEST_STAFF_ID,
  TEST_PATIENT_ID,
  createTestClinic,
  createTestDoctor,
  createTestStaff,
  createTestPatient,
  createTestAppointment,
  createTestMedicalRecord,
  createTestConsent,
  createTestCarePlan,
  createTestPayment,
} from './fixtures'
import {
  createDoctorAuthContext,
  createStaffAuthContext,
  clearAuthMocks,
} from './utils/auth-test-helpers'

describe('Test Fixtures', () => {
  describe('Clinic fixtures', () => {
    it('should create a test clinic with default values', () => {
      const clinic = createTestClinic()
      
      expect(clinic.id).toBe(TEST_CLINIC_ID)
      expect(clinic.name).toBe('Test Clinic')
      expect(clinic.address).toBeDefined()
      expect(clinic.phone).toBeDefined()
    })

    it('should allow overriding clinic properties', () => {
      const clinic = createTestClinic({ name: 'Custom Clinic' })
      
      expect(clinic.id).toBe(TEST_CLINIC_ID)
      expect(clinic.name).toBe('Custom Clinic')
    })
  })

  describe('Doctor fixtures', () => {
    it('should create a test doctor with default values', () => {
      const doctor = createTestDoctor()
      
      expect(doctor.id).toBe(TEST_DOCTOR_ID)
      expect(doctor.clinic_id).toBe(TEST_CLINIC_ID)
      expect(doctor.role).toBe('doctor')
      expect(doctor.email).toBeDefined()
    })

    it('should allow overriding doctor properties', () => {
      const doctor = createTestDoctor({ email: 'custom@clinic.com' })
      
      expect(doctor.email).toBe('custom@clinic.com')
      expect(doctor.role).toBe('doctor')
    })
  })

  describe('Staff fixtures', () => {
    it('should create a test staff member with default values', () => {
      const staff = createTestStaff()
      
      expect(staff.id).toBe(TEST_STAFF_ID)
      expect(staff.clinic_id).toBe(TEST_CLINIC_ID)
      expect(staff.role).toBe('staff')
      expect(staff.email).toBeDefined()
    })
  })

  describe('Patient fixtures', () => {
    it('should create a test patient with default values', () => {
      const patient = createTestPatient()
      
      expect(patient.id).toBe(TEST_PATIENT_ID)
      expect(patient.clinic_id).toBe(TEST_CLINIC_ID)
      expect(patient.first_name).toBe('Patient')
      expect(patient.phone).toBeDefined()
    })

    it('should allow overriding patient properties', () => {
      const patient = createTestPatient({ first_name: 'John' })
      
      expect(patient.first_name).toBe('John')
      expect(patient.clinic_id).toBe(TEST_CLINIC_ID)
    })
  })

  describe('Appointment fixtures', () => {
    it('should create a test appointment', () => {
      const appointment = createTestAppointment()
      
      expect(appointment.clinic_id).toBe(TEST_CLINIC_ID)
      expect(appointment.patient_id).toBe(TEST_PATIENT_ID)
      expect(appointment.doctor_id).toBe(TEST_DOCTOR_ID)
      expect(appointment.status).toBe('scheduled')
    })
  })

  describe('Medical Record fixtures', () => {
    it('should create a test medical record', () => {
      const record = createTestMedicalRecord()
      
      expect(record.clinic_id).toBe(TEST_CLINIC_ID)
      expect(record.patient_id).toBe(TEST_PATIENT_ID)
      expect(record.doctor_id).toBe(TEST_DOCTOR_ID)
      expect(record.record_type).toBe('consultation')
    })
  })

  describe('Consent fixtures', () => {
    it('should create a test consent record', () => {
      const consent = createTestConsent()
      
      expect(consent.clinic_id).toBe(TEST_CLINIC_ID)
      expect(consent.patient_id).toBe(TEST_PATIENT_ID)
      expect(consent.granted).toBe(true)
    })
  })

  describe('Care Plan fixtures', () => {
    it('should create a test care plan', () => {
      const plan = createTestCarePlan()
      
      expect(plan.clinic_id).toBe(TEST_CLINIC_ID)
      expect(plan.patient_id).toBe(TEST_PATIENT_ID)
      expect(plan.status).toBe('active')
    })
  })

  describe('Payment fixtures', () => {
    it('should create a test payment', () => {
      const payment = createTestPayment()
      
      expect(payment.clinic_id).toBe(TEST_CLINIC_ID)
      expect(payment.patient_id).toBe(TEST_PATIENT_ID)
      expect(payment.amount_paise).toBe(50000) // ₹500
      expect(payment.status).toBe('pending')
    })
  })
})

describe('Auth Context Factories', () => {
  beforeEach(() => {
    clearAuthMocks()
  })

  it('should create a doctor auth context', () => {
    const context = createDoctorAuthContext()
    
    expect(context.userId).toBe('doctor-clerk-id')
    expect(context.profile.role).toBe('doctor')
    expect(context.profile.email).toBe('doctor@test.clinic')
  })

  it('should create a staff auth context', () => {
    const context = createStaffAuthContext()
    
    expect(context.userId).toBe('staff-clerk-id')
    expect(context.profile.role).toBe('staff')
    expect(context.profile.email).toBe('staff@test.clinic')
  })
})