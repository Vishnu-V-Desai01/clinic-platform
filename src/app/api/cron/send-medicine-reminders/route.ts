// src/app/api/cron/send-medicine-reminders/route.ts
//
// Called every minute by Vercel Cron via vercel.json's crons block.
// Vercel's native cron scheduler authenticates itself by sending
// `Authorization: Bearer $CRON_SECRET` on every invocation — this route
// checks for that exact header. (Previously guarded by a custom
// `x-cron-secret` header for manual/pre-Pro testing; switched over now
// that vercel.json's crons block is live and Vercel is the real caller.)
//
// The admin "Run now" button (src/features/reminders/manual-trigger-actions.ts)
// does NOT go through this route at all — it calls sendDueMedicineReminders()
// directly, gated by Clerk admin auth instead of the cron secret. So this
// change only affects the cron path, not the manual trigger.
//
// All actual send logic lives in sendDueMedicineReminders() —
// src/lib/medicine-reminders/send-due-reminders.ts — this route is only
// the auth guard + HTTP wrapper around it.

import { NextResponse } from 'next/server'
import { sendDueMedicineReminders } from '@/lib/medicine-reminders/send-due-reminders'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const expected = process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : null

  if (!expected || authHeader !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await sendDueMedicineReminders()
    return NextResponse.json(result)
  } catch (err) {
    console.error('[cron/send-medicine-reminders]', err)
    return NextResponse.json({ error: 'Failed to send reminders' }, { status: 500 })
  }
}