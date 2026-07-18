/**
 * Global test setup
 * Sets up environment variables and provides mock utilities
 * Note: jest.mock() calls are done per-test, not here, to avoid module resolution issues
 */

// Mock Clerk environment
process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = 'test-key'
process.env.CLERK_SECRET_KEY = 'test-secret'
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'

// Reset all mocks before each test
beforeEach(() => {
  jest.clearAllMocks()
})