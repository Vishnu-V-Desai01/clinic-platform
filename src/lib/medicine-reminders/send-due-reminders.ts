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

import { createClient } from '@supabase/supabase-js'
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
 * (patient, reminder_time) into one WhatsApp message per group, sends via
 * the active message provider, and stamps last_sent_at on every row in a
 * successfully-sent group. Safe to call repeatedly — rows already sent
 * today are skipped.
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

  type ReminderGroup = {
    patientId: string
    clinicId: string
    reminderTime: string
    rowIds: string[]
    medicines: string[]
    mealAssociations: Set<string | null>
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
    const existing = groups.get(key)

    if (existing) {
      existing.rowIds.push(row.id)
      existing.medicines.push(String(row.medicine_name))
      existing.mealAssociations.add(row.meal_association)
    } else {
      groups.set(key, {
        patientId,
        clinicId: row.clinic_id,
        reminderTime: String(row.reminder_time),
        rowIds: [row.id],
        medicines: [String(row.medicine_name)],
        mealAssociations: new Set([row.meal_association]),
      })
    }
  }

  console.log(`[sendDueMedicineReminders] Grouped into ${groups.size} message(s), ${unattributedFailures} unattributed row(s)`)

  const provider = getMessageProvider()
  let   sent     = 0
  let   failed   = unattributedFailures
  const errors: string[] = []

  for (const group of groups.values()) {
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
        continue
      }

      const patient    = patientRes.data
      const clinicName = clinicRes.data?.name ?? 'your clinic'

      const phone = patient.phone.startsWith('91')
        ? patient.phone
        : `91${patient.phone}`
      const name = `${patient.first_name ?? ''} ${patient.last_name ?? ''}`.trim()

      const medicineList = group.medicines.join(', ')

      const singleMeal = group.mealAssociations.size === 1
        ? [...group.mealAssociations][0]
        : null
      const timing = formatTiming(singleMeal, group.reminderTime)

      const result = await provider.sendTemplateMessage({
        phone,
        templateName: PRESCRIPTION_REMINDER_TEMPLATE_NAME,
        languageCode: PRESCRIPTION_REMINDER_LANGUAGE_CODE,
        bodyParams: [name, clinicName, medicineList, timing],
      })

      if (result.success) {
        await supabase
          .from('care_plan_reminders')
          .update({ last_sent_at: new Date().toISOString() })
          .in('id', group.rowIds)

        sent++
        console.log(
          `[sendDueMedicineReminders] ✓ sent grouped reminder (${group.rowIds.length} medicine(s))` +
          ` — ${medicineList} → ${phone}`
        )
      } else {
        failed++
        errors.push(`group ${group.patientId}@${group.reminderTime}: ${result.errorMessage}`)
        console.error(`[sendDueMedicineReminders] ✗ failed:`, result.errorMessage)
      }
    } catch (err) {
      failed++
      errors.push(`error on group ${group.patientId}@${group.reminderTime}: ${String(err)}`)
      console.error('[sendDueMedicineReminders] unexpected error:', err)
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