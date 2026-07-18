/**
 * Database testing utilities
 * Helpers to mock Supabase queries, inserts, updates, deletes
 */

/**
 * Mock a successful SELECT query
 * Usage: mockSupabaseQuery('patients', [patient1, patient2])
 */
export const mockSupabaseQuery = (table: string, returnData: any[]) => {
  const supabase = require('@/lib/supabase').getSupabaseClient()
  
  supabase.from.mockReturnValue({
    select: jest.fn().mockResolvedValue({
      data: returnData,
      error: null,
    }),
  })
  
  return supabase.from(table)
}

/**
 * Mock a SELECT with filters (eq, in, etc.)
 */
export const mockSupabaseQueryWithFilter = (
  table: string,
  returnData: any
) => {
  const supabase = require('@/lib/supabase').getSupabaseClient()
  
  supabase.from.mockReturnValue({
    select: jest.fn().mockReturnValue({
      eq: jest.fn().mockResolvedValue({
        data: returnData,
        error: null,
      }),
      in: jest.fn().mockResolvedValue({
        data: returnData,
        error: null,
      }),
    }),
  })
  
  return supabase.from(table)
}

/**
 * Mock a single row query (e.g., user profile lookup)
 */
export const mockSupabaseSingleQuery = (table: string, returnData: any) => {
  const supabase = require('@/lib/supabase').getSupabaseClient()
  
  supabase.from.mockReturnValue({
    select: jest.fn().mockReturnValue({
      single: jest.fn().mockResolvedValue({
        data: returnData,
        error: null,
      }),
    }),
  })
  
  return supabase.from(table)
}

/**
 * Mock a query that returns nothing (null)
 */
export const mockSupabaseQueryEmpty = (table: string) => {
  const supabase = require('@/lib/supabase').getSupabaseClient()
  
  supabase.from.mockReturnValue({
    select: jest.fn().mockResolvedValue({
      data: [],
      error: null,
    }),
    maybeSingle: jest.fn().mockResolvedValue({
      data: null,
      error: null,
    }),
  })
  
  return supabase.from(table)
}

/**
 * Mock a query that returns an error
 */
export const mockSupabaseQueryError = (table: string, errorMessage: string) => {
  const supabase = require('@/lib/supabase').getSupabaseClient()
  
  supabase.from.mockReturnValue({
    select: jest.fn().mockResolvedValue({
      data: null,
      error: { message: errorMessage },
    }),
  })
  
  return supabase.from(table)
}

/**
 * Mock an INSERT operation
 */
export const mockSupabaseInsert = (table: string, returnData: any) => {
  const supabase = require('@/lib/supabase').getSupabaseClient()
  
  supabase.from.mockReturnValue({
    insert: jest.fn().mockResolvedValue({
      data: returnData,
      error: null,
    }),
  })
  
  return supabase.from(table)
}

/**
 * Mock an UPDATE operation
 */
export const mockSupabaseUpdate = (table: string, returnData: any) => {
  const supabase = require('@/lib/supabase').getSupabaseClient()
  
  supabase.from.mockReturnValue({
    update: jest.fn().mockResolvedValue({
      data: returnData,
      error: null,
    }),
  })
  
  return supabase.from(table)
}

/**
 * Mock a DELETE operation
 */
export const mockSupabaseDelete = (table: string) => {
  const supabase = require('@/lib/supabase').getSupabaseClient()
  
  supabase.from.mockReturnValue({
    delete: jest.fn().mockResolvedValue({
      data: null,
      error: null,
    }),
  })
  
  return supabase.from(table)
}

/**
 * Mock RLS functions (get_my_clinic_id, get_my_role, etc.)
 */
export const mockRLSFunctions = () => {
  const supabase = require('@/lib/supabase').getSupabaseClient()
  
  // get_my_clinic_id() -> returns TEST_CLINIC_ID
  supabase.rpc = jest.fn().mockImplementation((functionName: string) => {
    if (functionName === 'get_my_clinic_id') {
      return Promise.resolve({
        data: '11111111-1111-1111-1111-111111111111',
        error: null,
      })
    }
    if (functionName === 'get_my_role') {
      return Promise.resolve({
        data: 'doctor',
        error: null,
      })
    }
    return Promise.resolve({ data: null, error: null })
  })
  
  return supabase
}

/**
 * Clear all Supabase mocks
 */
export const clearDbMocks = () => {
  jest.clearAllMocks()
}