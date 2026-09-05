// src/components/time-picker.tsx
//
// Shared 12-hour time entry: typed Hour + Minute fields, AM/PM dropdown.
// Typing is never clamped mid-keystroke — onChange only strips non-digit
// characters. Range validation (hour 1-12, minute 0-59) happens on blur
// and is surfaced as an inline error, never a silent auto-correct.
//
// Reused by:
//   - src/features/post-visit/components/RemindersCard.tsx (Item 1)
//   - appointment scheduling (Item 4)
//
// Also exports convertTo24Hour / convertTo12Hour so both call sites
// share identical AM/PM <-> 24h conversion logic (in particular the
// 12:00 AM / 12:00 PM edge case), rather than each maintaining its own copy.

'use client'

import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export type TimePeriod = 'AM' | 'PM'

interface TimePickerProps {
  hour:   string
  minute: string
  period: TimePeriod

  onHourChange:   (hour: string) => void
  onMinuteChange: (minute: string) => void
  onPeriodChange: (period: TimePeriod) => void

  /** Fires whenever combined hour+minute validity changes, so the parent form can gate submission. */
  onValidityChange?: (isValid: boolean) => void

  idPrefix?: string
  disabled?: boolean
}

function validateHour(raw: string): string | null {
  const trimmed = raw.trim()
  if (trimmed === '') return 'Required'
  if (!/^\d{1,2}$/.test(trimmed)) return 'Numbers only'
  const n = parseInt(trimmed, 10)
  if (n < 1 || n > 12) return 'Must be 1–12'
  return null
}

function validateMinute(raw: string): string | null {
  const trimmed = raw.trim()
  if (trimmed === '') return 'Required'
  if (!/^\d{1,2}$/.test(trimmed)) return 'Numbers only'
  const n = parseInt(trimmed, 10)
  if (n < 0 || n > 59) return 'Must be 0–59'
  return null
}

// Sanitize only — strips non-digits, caps length. Never re-clamps by magnitude.
function sanitizeDigits(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, 2)
}

/** Convert 12-hour parts (hour "1"-"12", minute "00"-"59", AM/PM) to 24-hour "HH:MM". Assumes valid input — validate before calling. */
export function convertTo24Hour(hour: string, minute: string, period: TimePeriod): string {
  let h = parseInt(hour, 10)
  const m = parseInt(minute, 10)

  if (period === 'PM' && h !== 12) h += 12
  if (period === 'AM' && h === 12) h = 0

  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** Convert 24-hour "HH:MM" to 12-hour parts. */
export function convertTo12Hour(time24: string): { hour: string; minute: string; period: TimePeriod } {
  const [h, m] = time24.split(':').map(Number)
  let hour = h
  let period: TimePeriod = 'AM'

  if (h >= 12) {
    period = 'PM'
    if (h > 12) hour = h - 12
  } else if (h === 0) {
    hour = 12
  }

  return {
    hour: String(hour),
    minute: String(m).padStart(2, '0'),
    period,
  }
}

export default function TimePicker({
  hour,
  minute,
  period,
  onHourChange,
  onMinuteChange,
  onPeriodChange,
  onValidityChange,
  idPrefix = 'time-picker',
  disabled = false,
}: TimePickerProps) {
  const [hourTouched, setHourTouched]     = useState(false)
  const [minuteTouched, setMinuteTouched] = useState(false)

  const hourError   = validateHour(hour)
  const minuteError = validateMinute(minute)

  useEffect(() => {
    onValidityChange?.(hourError === null && minuteError === null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hour, minute])

  return (
    <div className="flex gap-3 items-start">
      {/* Hour */}
      <div className="flex flex-col gap-2 flex-1">
        <Input
          id={`${idPrefix}-hour`}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={2}
          value={hour}
          disabled={disabled}
          placeholder="HH"
          onFocus={(e) => e.target.select()}
          onChange={(e) => onHourChange(sanitizeDigits(e.target.value))}
          onBlur={() => {
            setHourTouched(true)
            if (validateHour(hour) === null) {
              onHourChange(String(parseInt(hour, 10))) // e.g. "07" -> "7"
            }
          }}
          aria-invalid={hourTouched && hourError !== null}
          className={
            hourTouched && hourError
              ? 'h-11 text-center text-base border-destructive focus-visible:ring-destructive/50'
              : 'h-11 text-center text-base'
          }
        />
        <span className="text-xs text-muted-foreground text-center">Hour</span>
        {hourTouched && hourError && (
          <span className="text-xs text-destructive text-center">{hourError}</span>
        )}
      </div>

      {/* Separator */}
      <div className="pt-2.5">
        <span className="text-2xl font-semibold text-foreground">:</span>
      </div>

      {/* Minute */}
      <div className="flex flex-col gap-2 flex-1">
        <Input
          id={`${idPrefix}-minute`}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={2}
          value={minute}
          disabled={disabled}
          placeholder="MM"
          onFocus={(e) => e.target.select()}
          onChange={(e) => onMinuteChange(sanitizeDigits(e.target.value))}
          onBlur={() => {
            setMinuteTouched(true)
            if (validateMinute(minute) === null) {
              onMinuteChange(String(parseInt(minute, 10)).padStart(2, '0')) // e.g. "5" -> "05"
            }
          }}
          aria-invalid={minuteTouched && minuteError !== null}
          className={
            minuteTouched && minuteError
              ? 'h-11 text-center text-base border-destructive focus-visible:ring-destructive/50'
              : 'h-11 text-center text-base'
          }
        />
        <span className="text-xs text-muted-foreground text-center">Minute</span>
        {minuteTouched && minuteError && (
          <span className="text-xs text-destructive text-center">{minuteError}</span>
        )}
      </div>

      {/* AM/PM */}
      <div className="flex flex-col gap-2 flex-1">
        <Select value={period} onValueChange={(v) => onPeriodChange(v as TimePeriod)} disabled={disabled}>
          <SelectTrigger id={`${idPrefix}-period`} className="h-11">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="AM">AM</SelectItem>
            <SelectItem value="PM">PM</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground text-center">Period</span>
      </div>
    </div>
  )
}