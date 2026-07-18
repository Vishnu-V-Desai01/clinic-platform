/**
 * Tests for src/features/appointments/types.ts
 * Pure functions - no mocking needed.
 *
 * Note on the catch/fallback blocks in the format-date and isUpcoming/
 * isPast functions below: verified directly against this Node/ICU
 * environment (see conversation) that toLocaleDateString/toLocaleTimeString/
 * toLocaleString do NOT throw for an Invalid Date - they return the
 * string "Invalid Date" instead - and that comparisons involving an
 * Invalid Date (NaN internally) evaluate to false rather than throwing.
 * That means every catch block here appears to be unreachable dead code
 * in practice, not a real fallback path. Tests reflect the VERIFIED
 * behavior (the literal string "Invalid Date" reaches the UI) rather
 * than the "—" the catch blocks suggest but never actually return.
 */

import {
  statusLabel,
  durationLabel,
  formatAppointmentDate,
  formatAppointmentTime,
  formatAppointmentDateTime,
  isUpcoming,
  isPast,
} from '../../../features/appointments/types'

describe('statusLabel', () => {
  it('returns the friendly label for each known status', () => {
    expect(statusLabel('scheduled')).toBe('Scheduled')
    expect(statusLabel('completed')).toBe('Completed')
    expect(statusLabel('cancelled')).toBe('Cancelled')
    expect(statusLabel('no_show')).toBe('No Show')
  })

  it('falls back to the raw value for an unknown status', () => {
    expect(statusLabel('some_future_status' as never)).toBe('some_future_status')
  })
})

describe('durationLabel', () => {
  it('returns the friendly label for each known duration', () => {
    expect(durationLabel(15)).toBe('15 min')
    expect(durationLabel(60)).toBe('1 hour')
    expect(durationLabel(90)).toBe('1.5 hours')
  })

  it('falls back to "N min" for a duration outside the preset list', () => {
    expect(durationLabel(999)).toBe('999 min')
  })
})

describe('formatAppointmentDate (IST-aware)', () => {
  it('formats a straightforward IST timestamp as YYYY-MM-DD', () => {
    expect(formatAppointmentDate('2026-06-20T14:30:00+05:30')).toBe('2026-06-20')
  })

  it('uses the IST calendar date even when it differs from the UTC calendar date', () => {
    // 2026-06-20T01:00:00+05:30 (1 AM IST) is 2026-06-19T19:30:00Z in UTC -
    // a different day in UTC. This confirms the function genuinely reads
    // the IST date, not whatever the ambient process timezone happens to be.
    expect(formatAppointmentDate('2026-06-20T01:00:00+05:30')).toBe('2026-06-20')
  })

  it('returns the literal string "Invalid Date" for unparseable input (verified: does not throw, so the catch/em-dash path is not reached)', () => {
    expect(formatAppointmentDate('not-a-real-date')).toBe('Invalid Date')
  })
})

describe('formatAppointmentTime (IST-aware)', () => {
  it('formats a straightforward IST timestamp as 24-hour HH:MM', () => {
    expect(formatAppointmentTime('2026-06-20T14:30:00+05:30')).toBe('14:30')
  })

  it('uses the IST time even across a UTC day boundary', () => {
    expect(formatAppointmentTime('2026-06-20T01:00:00+05:30')).toBe('01:00')
  })

  it('returns "Invalid Date" for unparseable input', () => {
    expect(formatAppointmentTime('not-a-real-date')).toBe('Invalid Date')
  })
})

describe('formatAppointmentDateTime (IST-aware)', () => {
  it('formats a full IST date and time', () => {
    expect(formatAppointmentDateTime('2026-06-20T14:30:00+05:30')).toBe('20 Jun 2026, 02:30 pm')
  })

  it('returns "Invalid Date" for unparseable input', () => {
    expect(formatAppointmentDateTime('not-a-real-date')).toBe('Invalid Date')
  })
})

describe('isUpcoming / isPast', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2026-07-15T12:00:00.000Z'))
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('isUpcoming is true for a future instant, false for a past one', () => {
    expect(isUpcoming('2026-07-15T13:00:00.000Z')).toBe(true)
    expect(isUpcoming('2026-07-15T11:00:00.000Z')).toBe(false)
  })

  it('isPast is true for a past instant, false for a future one', () => {
    expect(isPast('2026-07-15T11:00:00.000Z')).toBe(true)
    expect(isPast('2026-07-15T13:00:00.000Z')).toBe(false)
  })

  it('both return false (not throw) for unparseable input - NaN comparisons never throw', () => {
    expect(isUpcoming('not-a-real-date')).toBe(false)
    expect(isPast('not-a-real-date')).toBe(false)
  })
})