// src/features/analytics/schema.ts
//
// Validation for the dashboard's date-range filter. This is the only
// user-facing input on this feature — daily_metrics and anomaly_alerts
// are written exclusively by the Step 6 rollup job, never by a form, so
// there's nothing else here for Zod to validate.

import { z } from 'zod'

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD')
  .refine((v) => !Number.isNaN(Date.parse(v)), { message: 'Invalid date' })

const MAX_RANGE_DAYS = 366

export const dateRangeFilterSchema = z
  .object({
    preset: z.enum([
      'today',
      'this_week',
      'this_month',
      'last_30_days',
      'last_90_days',
      'custom',
    ]),
    startDate: isoDate.optional(),
    endDate: isoDate.optional(),
  })
  .refine(
    (v) => v.preset !== 'custom' || (v.startDate && v.endDate),
    { message: 'Custom range requires both a start and end date' },
  )
  .refine(
    (v) => v.preset !== 'custom' || !v.startDate || !v.endDate || v.startDate <= v.endDate,
    { message: 'Start date must be on or before end date' },
  )
  .refine(
    (v) => {
      if (v.preset !== 'custom' || !v.startDate || !v.endDate) return true
      const days =
        (new Date(v.endDate).getTime() - new Date(v.startDate).getTime()) / 86_400_000
      return days <= MAX_RANGE_DAYS
    },
    { message: `Custom range can't exceed ${MAX_RANGE_DAYS} days` },
  )

export type DateRangeFilterInput = z.input<typeof dateRangeFilterSchema>
export type DateRangeFilterData = z.output<typeof dateRangeFilterSchema>