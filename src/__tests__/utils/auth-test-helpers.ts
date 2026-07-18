/**
 * Auth testing utilities
 * Factories for creating test auth contexts and fixtures
 */

import { TEST_CLINIC_ID, TEST_DOCTOR_ID, TEST_STAFF_ID } from '../fixtures'

/**
 * Create a mock doctor auth context
 */
export const createDoctorAuthContext = () => ({
  userId: 'doctor-clerk-id',
  sessionId: 'test-session-id',
  profile: {
    id: TEST_DOCTOR_ID,
    clinic_id: TEST_CLINIC_ID,
    user_id: 'doctor-clerk-id',
    email: 'doctor@test.clinic',
    first_name: 'Dr.',
    last_name: 'Test',
    role: 'doctor',
    status: 'active',
  },
})

/**
 * Create a mock staff auth context
 */
export const createStaffAuthContext = () => ({
  userId: 'staff-clerk-id',
  sessionId: 'test-session-id',
  profile: {
    id: TEST_STAFF_ID,
    clinic_id: TEST_CLINIC_ID,
    user_id: 'staff-clerk-id',
    email: 'staff@test.clinic',
    first_name: 'Staff',
    last_name: 'Test',
    role: 'staff',
    status: 'active',
  },
})

/**
 * Setup doctor context for tests
 */
export const setupDoctorContext = () => {
  jest.mock('@/lib/auth-helpers', () => ({
    requireRole: jest.fn().mockResolvedValue({
      role: 'doctor',
      userId: 'doctor-clerk-id',
    }),
    hasRole: jest.fn().mockReturnValue(true),
    getOrCreateProfile: jest.fn().mockResolvedValue(createDoctorAuthContext().profile),
  }))
}

/**
 * Setup staff context for tests
 */
export const setupStaffContext = () => {
  jest.mock('@/lib/auth-helpers', () => ({
    requireRole: jest.fn().mockResolvedValue({
      role: 'staff',
      userId: 'staff-clerk-id',
    }),
    hasRole: jest.fn().mockReturnValue(true),
    getOrCreateProfile: jest.fn().mockResolvedValue(createStaffAuthContext().profile),
  }))
}

/**
 * Clear all auth mocks
 */
export const clearAuthMocks = () => {
  jest.clearAllMocks()
  jest.resetModules()
}