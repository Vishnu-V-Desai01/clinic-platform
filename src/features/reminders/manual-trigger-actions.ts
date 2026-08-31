// src/features/reminders/manual-trigger-actions.ts
//
// Item 4: admin-only manual trigger for the medicine-reminder send job.
// Calls sendDueMedicineReminders() directly (same function the cron
// route wraps) — no HTTP round-trip, no cron secret needed, since this
// is a Clerk-authenticated admin action, not a cron caller. Exists so
// the send job can be tested/run today without Vercel Pro's real cron,
// and remains useful after Pro is purchased as an "I don't want to wait
// for the next minute" manual override.
//
// Deliberately gated tighter than most doctor/staff actions in this
// codebase — requireAdmin(), not requireRole('doctor','staff') — since
// this can send real WhatsApp messages to real patients and consumes
// clinic message quota; an accidental click by a non-admin staff member
// shouldn't be able to trigger it.

'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/supabase/profile'
import { sendDueMedicineReminders, type SendDueRemindersResult } from '@/lib/medicine-reminders/send-due-reminders'

type RunMedicineReminderSendNowResult =
  | { success: true; result: SendDueRemindersResult }
  | { success: false; error: string }

export async function runMedicineReminderSendNow(): Promise<RunMedicineReminderSendNowResult> {
  await requireAdmin()

  try {
    const result = await sendDueMedicineReminders()
    revalidatePath('/dashboard/settings')
    return { success: true, result }
  } catch (err) {
    console.error('[runMedicineReminderSendNow]', err)
    return { success: false, error: 'Failed to run the reminder send job.' }
  }
}