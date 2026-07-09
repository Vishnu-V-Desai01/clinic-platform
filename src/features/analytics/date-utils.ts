// src/features/analytics/date-utils.ts
//
// Pure date-range helpers for the doctor dashboard and, later, the
// anomaly job. Deliberately NOT in actions.ts: Next.js requires every
// export from a "use server" file to be an async function, and these are
// plain sync helpers — this file has no "use server" directive at all.
//
// All dates are IST calendar dates ("YYYY-MM-DD"), matching the clinic's
// single timezone (Gulf expansion isn't live yet).

import type { DateRangeFilterData } from './schema'

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000

/** Today's date, as an IST calendar day, regardless of server timezone. */
export function todayIST(): string {
  const ist = new Date(Date.now() + IST_OFFSET_MS)
  return ist.toISOString().slice(0, 10)
}

/** Add (or subtract, with a negative value) whole days to a "YYYY-MM-DD" string. */
export function shiftDate(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** The Monday on or before the given date. */
export function startOfWeek(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  const day = d.getUTCDay() // 0 = Sunday .. 6 = Saturday
  const daysSinceMonday = day === 0 ? 6 : day - 1
  return shiftDate(dateStr, -daysSinceMonday)
}

/** The 1st of the given date's month. */
export function startOfMonth(dateStr: string): string {
  return `${dateStr.slice(0, 7)}-01`
}

/** Turns a validated filter into a concrete [startDate, endDate] pair (both IST calendar dates, inclusive). */
export function resolveDateRange(
  filter: DateRangeFilterData,
): { startDate: string; endDate: string } {
  const today = todayIST()
  switch (filter.preset) {
    case 'today':
      return { startDate: today, endDate: today }
    case 'this_week':
      return { startDate: startOfWeek(today), endDate: today }
    case 'this_month':
      return { startDate: startOfMonth(today), endDate: today }
    case 'last_30_days':
      return { startDate: shiftDate(today, -29), endDate: today }
    case 'last_90_days':
      return { startDate: shiftDate(today, -89), endDate: today }
    case 'custom':
      // The schema's refine() guarantees these exist when preset === 'custom'.
      return { startDate: filter.startDate!, endDate: filter.endDate! }
  }
}

/**
 * Converts an inclusive [startDate, endDate] IST calendar range into UTC
 * timestamptz bounds for querying — a start instant and an EXCLUSIVE end
 * instant, since appointment_date / created_at / collection_date are all
 * timestamptz, not date.
 */
export function istRangeBounds(
  startDate: string,
  endDate: string,
): { startBound: string; endExclusive: string } {
  return {
    startBound: `${startDate}T00:00:00+05:30`,
    endExclusive: `${shiftDate(endDate, 1)}T00:00:00+05:30`,
  }
}