/**
 * Tests for src/features/patients/types.ts
 * Pure functions only - no mocking needed.
 */

import { calculateAge, genderLabel, statusLabel } from '../../../features/patients/types'

describe('calculateAge', () => {
  // "Today" is fixed via fake timers so age-boundary tests are deterministic
  // regardless of when the suite actually runs. Both "now" and every DOB
  // below use date-only strings ("YYYY-MM-DD"), matching the real shape
  // date_of_birth always has - this keeps UTC-midnight parsing consistent
  // on both sides of the comparison rather than mixing string and
  // local-time Date construction.
  beforeEach(() => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2026-07-15'))
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('returns null for a null date of birth', () => {
    expect(calculateAge(null)).toBeNull()
  })

  it('returns null for an unparseable date string', () => {
    expect(calculateAge('not-a-date')).toBeNull()
  })

  it('counts the birthday as already happened when it is today', () => {
    expect(calculateAge('2000-07-15')).toBe(26)
  })

  it('counts the birthday as already happened when it was yesterday', () => {
    expect(calculateAge('2000-07-14')).toBe(26)
  })

  it('does not count the birthday yet when it is tomorrow', () => {
    expect(calculateAge('2000-07-16')).toBe(25)
  })

  it('handles a birth month earlier in the year (birthday long passed)', () => {
    expect(calculateAge('2000-01-01')).toBe(26)
  })

  it('handles a birth month later in the year (birthday not yet reached)', () => {
    expect(calculateAge('2000-12-31')).toBe(25)
  })

  it('handles someone born this year (age 0)', () => {
    expect(calculateAge('2026-01-01')).toBe(0)
  })
})

describe('genderLabel', () => {
  it('returns the friendly label for each known gender value', () => {
    expect(genderLabel('male')).toBe('Male')
    expect(genderLabel('female')).toBe('Female')
    expect(genderLabel('other')).toBe('Other')
    expect(genderLabel('prefer_not_to_say')).toBe('Prefer not to say')
  })

  it('falls back to an em dash for null', () => {
    expect(genderLabel(null)).toBe('—')
  })
})

describe('statusLabel', () => {
  it('returns the friendly label for each known status value', () => {
    expect(statusLabel('active')).toBe('Active')
    expect(statusLabel('inactive')).toBe('Inactive')
    expect(statusLabel('archived')).toBe('Archived')
  })

  it('falls back to the raw value for a status outside the known set (e.g. DB drift)', () => {
    // Not reachable through normal TS-checked call sites (PatientStatus is
    // a closed union) - this documents the defensive runtime fallback for
    // data that could exist despite that, e.g. a stray value written
    // directly to the DB.
    expect(statusLabel('some_future_status' as never)).toBe('some_future_status')
  })
})