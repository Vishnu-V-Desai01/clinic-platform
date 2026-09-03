// src/lib/medicine-reminders/send-due-reminders.ts
//
// Core medicine-reminder send logic, extracted so both the cron route
// (src/app/api/cron/send-medicine-reminders/route.ts) and the manual
// admin trigger (src/features/reminders/manual-trigger-actions.ts) call
// the exact same implementation — no risk of the two drifting apart.
//
// See the cron route's file header for the full design rationale
// (grouping by patient+time, English-only template, {{4}} timing
// fallback). This file is that logic, unattached from HTTP/auth concerns.
//
// TIMEZONE FIX (Item 4 testing): the original getNowIST() manually added
// a fixed 5.5h offset to Date.now() and then read .getHours()/.getMinutes()
// off the result. Those two methods read through the SERVER's local
// timezone, not UTC — so on any machine whose local zone is already IST
// (confirmed: this dev environment runs in Asia/Calcutta), the offset
// silently double-applied, producing a "current time" 5.5 hours ahead of
// reality. Replaced with Intl.DateTimeFormat's explicit timeZone option,
// which is genuinely timezone-safe regardless of the server's local zone
// — the same pattern already used correctly elsewhere in this codebase
// (appointments/types.ts: formatAppointmentDate/formatAppointmentTime).
//
// IMPORTANT: currentTime must be plain "HH:MM", NO seconds. The app's
// real write path (RemindersCard.tsx's convertTo24Hour) only ever
// produces "HH:MM" — confirmed by reading that function directly. A
// currentTime value with seconds appended can never .eq()-match a
// stored "HH:MM" row, since it's exact string equality. Match type is
// deliberately .eq(), not .lte() or any range comparison — reminders
// fire on an exact-minute match, not "any time at or before now" (which
// would incorrectly re-match every already-past reminder every single
// minute for the rest of the day, relying ENTIRELY on the last_sent_at
// check to prevent duplicate sends instead of the query itself scoping
// correctly).
//
// CONCURRENCY FIX (Chat 24C idempotency audit): the original flow was
// "query due rows -> send -> mark last_sent_at on success." That has a
// race window: if two invocations overlap (e.g. a cron tick fires while
// someone clicks "Run Now"), both can read the same rows as due BEFORE
// either one's UPDATE lands, and both send.
//
// Fixed with an atomic claim-then-send pattern: each row is claimed via
// a compare-and-swap UPDATE (`SET last_sent_at = now() WHERE id = X AND
// last_sent_at IS <the value we just read>`), and only rows we actually
// won the claim on get sent. Postgres serializes concurrent UPDATEs on
// the same row: the second transaction's WHERE clause re-evaluates
// after the first commits, sees last_sent_at has changed, and matches
// zero rows — so only one caller can ever claim a given row. If the
// send itself fails after a successful claim, the claim is rolled back
// to its pre-claim value so the next tick retries that dose.

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { getMessageProvider } from '@/features/messaging/providers'

// English-only, per Item 4's explicit design decision.
const PRESCRIPTION_REMINDER_TEMPLATE_NAME = 'curakin_medicine_reminder_en'
const PRESCRIPTION_REMINDER_LANGUAGE_CODE = 'en'

/**
 * Derives the current IST wall-clock time (HH:MM, 24-hour, NO seconds)
 * and date (YYYY-MM-DD) directly from the real UTC instant via Intl,
 * independent of the server's own local timezone.
 */
function getISTParts(): { currentTime: string; todayStr: string } {
  const now = new Date()

  const timeFormatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const currentTime = timeFormatter.format(now) // "HH:MM", already 24-hour, NO seconds

  const dateFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const todayStr = dateFormatter.format(now) // "YYYY-MM-DD" (en-CA gives ISO order)

  return { currentTime, todayStr }
}

// "before_breakfast" -> "before breakfast". Falls back to the reminder's
// own clock time when there's no meal context — matches the template's
// {{4}} design ("to take X {{4}}"), which reads naturally either way:
// "to take X before breakfast" / "to take X at 21:00".
function formatTiming(mealAssociation: string | null | undefined, reminderTime: string): string {
  if (!mealAssociation) return `at ${reminderTime}`
  return mealAssociation.replace(/_/g, ' ')
}

type DueReminderRow = {
  id: string
  clinic_id: string
  medicine_name: string | null
  meal_association: string | null
  reminder_time: string | null
  duration_days: number | null
  start_date: string | null
  last_sent_at: string | null
  care_plans: { patient_id: string } | { patient_id: string }[] | null
}

function extractPatientId(row: DueReminderRow): string | undefined {
  const cp = row.care_plans
  if (!cp) return undefined
  return Array.isArray(cp) ? cp[0]?.patient_id : cp.patient_id
}

/**
 * Atomically claims a single reminder row: sets last_sent_at to `nowIso`
 * ONLY if it still equals the value we originally read (`previousValue`).
 * Returns true if this call won the claim, false if someone else already
 * claimed it (or the row no longer matches for any other reason).
 */
async function claimRow(
  supabase: SupabaseClient,
  rowId: string,
  previousValue: string | null,
  nowIso: string,
): Promise<boolean> {
  let query = supabase
    .from('care_plan_reminders')
    .update({ last_sent_at: nowIso })
    .eq('id', rowId)

  query = previousValue === null
    ? query.is('last_sent_at', null)
    : query.eq('last_sent_at', previousValue)

  const { data, error } = await query.select('id')

  if (error) {
    console.error(`[sendDueMedicineReminders] claim error for row ${rowId}:`, error)
    return false
  }

  return (data?.length ?? 0) > 0
}

/**
 * Rolls back a previously-claimed row to its pre-claim value. Called
 * when a claim succeeded but the subsequent send failed, so the row is
 * eligible to be picked up and retried on the next tick.
 */
async function rollbackClaim(
  supabase: SupabaseClient,
  rowId: string,
  previousValue: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('care_plan_reminders')
    .update({ last_sent_at: previousValue })
    .eq('id', rowId)

  if (error) {
    // This is a genuine problem: the row stays claimed (marked sent)
    // despite never actually sending, so it silently skips future
    // ticks until last_sent_at's date rolls over. Logged loudly so
    // Sentry/console surfaces it — this needs human eyes, not a retry.
    console.error(
      `[sendDueMedicineReminders] ROLLBACK FAILED for row ${rowId} — ` +
      `row will be stuck as claimed-but-unsent until next day's reset:`,
      error,
    )
  }
}

export type SendDueRemindersResult = {
  sent: number
  failed: number
  groupedMessageCount: number
  reminderRowCount: number
  currentTime: string
  errors?: string[]
}

/**
 * Finds medicine reminders due at the current IST minute, groups them by
 * (patient, reminder_time) into one WhatsApp message per group, claims
 * each row atomically before sending, sends via the active message
 * provider, and rolls back the claim on send failure so the row can be
 * retried. Safe to call repeatedly and safe to call concurrently — the
 * per-row compare-and-swap claim means overlapping invocations can never
 * both send the same dose.
 */
export async function sendDueMedicineReminders(): Promise<SendDueRemindersResult> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { currentTime, todayStr } = getISTParts()

  console.log(`[sendDueMedicineReminders] IST: ${currentTime}  date: ${todayStr}`)

  const { data: reminders, error: remError } = await supabase
    .from('care_plan_reminders')
    .select(`
      id,
      clinic_id,
      medicine_name,
      meal_association,
      reminder_time,
      duration_days,
      start_date,
      last_sent_at,
      care_plans ( patient_id )
    `)
    .eq('reminder_type', 'medicine')
    .eq('enabled', true)
    .eq('reminder_time', currentTime)
    .not('medicine_name', 'is', null)
    .not('reminder_time', 'is', null)

  if (remError) {
    console.error('[sendDueMedicineReminders] query error:', remError)
    throw new Error('Failed to query reminders')
  }

  const due = ((reminders ?? []) as DueReminderRow[]).filter((row) => {
    if (row.last_sent_at) {
      const lastSentDate = String(row.last_sent_at).split('T')[0]
      if (lastSentDate === todayStr) return false
    }
    if (row.duration_days != null && row.start_date) {
      const start = new Date(String(row.start_date))
      const end   = new Date(start)
      end.setDate(end.getDate() + Number(row.duration_days))
      if (new Date(todayStr) > end) return false
    }
    return true
  })

  console.log(`[sendDueMedicineReminders] Due this minute: ${due.length}`)

  if (due.length === 0) {
    return { sent: 0, failed: 0, groupedMessageCount: 0, reminderRowCount: 0, currentTime }
  }

  type ReminderGroupRow = {
    id: string
    medicineName: string
    mealAssociation: string | null
    previousLastSentAt: string | null
  }

  type ReminderGroup = {
    patientId: string
    clinicId: string
    reminderTime: string
    rows: ReminderGroupRow[]
  }

  const groups = new Map<string, ReminderGroup>()
  let unattributedFailures = 0

  for (const row of due) {
    const patientId = extractPatientId(row)
    if (!patientId) {
      unattributedFailures++
      continue
    }

    const key = `${patientId}::${row.reminder_time}`
    const groupRow: ReminderGroupRow = {
      id: row.id,
      medicineName: String(row.medicine_name),
      mealAssociation: row.meal_association,
      previousLastSentAt: row.last_sent_at,
    }

    const existing = groups.get(key)
    if (existing) {
      existing.rows.push(groupRow)
    } else {
      groups.set(key, {
        patientId,
        clinicId: row.clinic_id,
        reminderTime: String(row.reminder_time),
        rows: [groupRow],
      })
    }
  }

  console.log(`[sendDueMedicineReminders] Grouped into ${groups.size} message(s), ${unattributedFailures} unattributed row(s)`)

  const provider = getMessageProvider()
  const nowIso   = new Date().toISOString()
  let   sent     = 0
  let   failed   = unattributedFailures
  const errors: string[] = []

  for (const group of groups.values()) {
    // Claim every row in this group atomically, in parallel. Only rows
    // we actually win get sent — a row already claimed by a concurrent
    // invocation (overlapping cron tick, or a manual "Run Now" click)
    // simply won't be part of the outgoing message.
    const claimResults = await Promise.all(
      group.rows.map(async (row) => ({
        row,
        claimed: await claimRow(supabase, row.id, row.previousLastSentAt, nowIso),
      })),
    )

    const claimedRows = claimResults.filter((r) => r.claimed).map((r) => r.row)

    if (claimedRows.length === 0) {
      // Every row in this group was already claimed by another
      // invocation between our query and our claim attempt. Nothing to
      // do — not a failure, just a benign race we lost gracefully.
      console.log(
        `[sendDueMedicineReminders] group ${group.patientId}@${group.reminderTime} — ` +
        `all rows already claimed elsewhere, skipping`
      )
      continue
    }

    try {
      const [patientRes, clinicRes] = await Promise.all([
        supabase
          .from('patients')
          .select('phone, first_name, last_name')
          .eq('id', group.patientId)
          .single(),
        supabase
          .from('clinics')
          .select('name')
          .eq('id', group.clinicId)
          .single(),
      ])

      if (patientRes.error || !patientRes.data?.phone) {
        failed++
        errors.push(`No phone for patient ${group.patientId}`)
        // Roll back every row we claimed — we never actually sent.
        await Promise.all(
          claimedRows.map((row) => rollbackClaim(supabase, row.id, row.previousLastSentAt)),
        )
        continue
      }

      const patient    = patientRes.data
      const clinicName = clinicRes.data?.name ?? 'your clinic'

      const phone = patient.phone.startsWith('91')
        ? patient.phone
        : `91${patient.phone}`
      const name = `${patient.first_name ?? ''} ${patient.last_name ?? ''}`.trim()

      const medicineList = claimedRows.map((r) => r.medicineName).join(', ')

      const mealAssociations = new Set(claimedRows.map((r) => r.mealAssociation))
      const singleMeal = mealAssociations.size === 1 ? [...mealAssociations][0] : null
      const timing = formatTiming(singleMeal, group.reminderTime)

      const result = await provider.sendTemplateMessage({
        phone,
        templateName: PRESCRIPTION_REMINDER_TEMPLATE_NAME,
        languageCode: PRESCRIPTION_REMINDER_LANGUAGE_CODE,
        bodyParams: [name, clinicName, medicineList, timing],
      })

      if (result.success) {
        // Rows are already marked sent (the claim IS the mark) — nothing
        // further to write.
        sent++
        console.log(
          `[sendDueMedicineReminders] ✓ sent grouped reminder (${claimedRows.length} medicine(s))` +
          ` — ${medicineList} → ${phone}`
        )
      } else {
        failed++
        errors.push(`group ${group.patientId}@${group.reminderTime}: ${result.errorMessage}`)
        console.error(`[sendDueMedicineReminders] ✗ failed:`, result.errorMessage)
        // Send failed after a successful claim — roll back so this
        // dose is retried next tick instead of silently skipped.
        await Promise.all(
          claimedRows.map((row) => rollbackClaim(supabase, row.id, row.previousLastSentAt)),
        )
      }
    } catch (err) {
      failed++
      errors.push(`error on group ${group.patientId}@${group.reminderTime}: ${String(err)}`)
      console.error('[sendDueMedicineReminders] unexpected error:', err)
      // Unknown failure after claiming — same rollback logic applies so
      // we don't lose the dose silently.
      await Promise.all(
        claimedRows.map((row) => rollbackClaim(supabase, row.id, row.previousLastSentAt)),
      )
    }
  }

  console.log(`[sendDueMedicineReminders] Done — sent: ${sent}  failed: ${failed}`)

  return {
    sent,
    failed,
    groupedMessageCount: groups.size,
    reminderRowCount: due.length,
    currentTime,
    errors: errors.length > 0 ? errors : undefined,
  }
}