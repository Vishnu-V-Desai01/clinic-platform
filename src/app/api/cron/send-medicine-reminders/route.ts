// src/app/api/cron/send-medicine-reminders/route.ts
//
// Called every minute by Vercel Cron once vercel.json's cron config is
// added (deferred until Vercel Pro is purchased — see project notes,
// blocker B: a crons block in vercel.json fails the build on Hobby).
// Until then, this route is only reachable by manual trigger — either a
// direct authenticated hit with the x-cron-secret header, or the
// admin-only "Run now" button on the Settings page (see
// src/features/reminders/manual-trigger-actions.ts, which calls the
// shared sendDueMedicineReminders() function directly rather than
// through this HTTP route, so it doesn't need the cron secret).
//
// All actual send logic lives in sendDueMedicineReminders() —
// src/lib/medicine-reminders/send-due-reminders.ts — this route is only
// the auth guard + HTTP wrapper around it.

import { NextResponse } from 'next/server'
import { sendDueMedicineReminders } from '@/lib/medicine-reminders/send-due-reminders'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const secret = request.headers.get('x-cron-secret')
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
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