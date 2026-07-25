// src/app/api/cron/send-medicine-reminders/route.ts
//
// Called every minute by Supabase pg_cron (Chat 24) or manually in dev.
// Finds medicine reminders due at the current IST time, sends WhatsApp
// messages via MSG91, and records last_sent_at to prevent duplicates.
//
// Security: requires x-cron-secret header matching CRON_SECRET env var.
// Uses Supabase service role key to bypass RLS (no user session in cron context).

import { NextResponse }  from 'next/server'
import { createClient }  from '@supabase/supabase-js'
import { getMessageProvider } from '@/features/messaging/providers'

export const dynamic = 'force-dynamic'

// IST = UTC + 5:30
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000

function getNowIST(): Date {
  return new Date(Date.now() + IST_OFFSET_MS)
}

function formatMealContext(mealAssociation: string | null | undefined): string {
  if (!mealAssociation) return 'as prescribed'
  // "before_breakfast" → "before breakfast"
  return mealAssociation.replace(/_/g, ' ')
}

export async function GET(request: Request) {
  // ── Auth guard ──────────────────────────────────────────────────────────
  const secret = request.headers.get('x-cron-secret')
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── Service-role client — bypasses RLS (safe: cron-only route) ──────────
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // ── Current IST time as HH:MM ────────────────────────────────────────────
  const nowIST      = getNowIST()
  const istHour     = String(nowIST.getHours()).padStart(2, '0')
  const istMinute   = String(nowIST.getMinutes()).padStart(2, '0')
  const currentTime = `${istHour}:${istMinute}`
  const todayStr    = nowIST.toISOString().split('T')[0]

  console.log(`[send-medicine-reminders] IST: ${currentTime}  date: ${todayStr}`)

  // ── Query reminders due at this exact minute ─────────────────────────────
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
    console.error('[send-medicine-reminders] query error:', remError)
    return NextResponse.json({ error: 'Failed to query reminders' }, { status: 500 })
  }

  // ── Filter: skip already-sent-today and past-duration reminders ──────────
  const due = (reminders ?? []).filter((row: any) => {
    // Already sent today?
    if (row.last_sent_at) {
      const lastSentDate = String(row.last_sent_at).split('T')[0]
      if (lastSentDate === todayStr) return false
    }
    // Past the duration window?
    if (row.duration_days != null && row.start_date) {
      const start = new Date(String(row.start_date))
      const end   = new Date(start)
      end.setDate(end.getDate() + Number(row.duration_days))
      if (new Date(todayStr) > end) return false
    }
    return true
  })

  console.log(`[send-medicine-reminders] Due this minute: ${due.length}`)

  if (due.length === 0) {
    return NextResponse.json({ sent: 0, failed: 0 })
  }

  // ── Send each reminder ───────────────────────────────────────────────────
  const provider = getMessageProvider()
  let   sent     = 0
  let   failed   = 0
  const errors: string[] = []

  for (const reminder of due) {
    const patientId = (reminder as any).care_plans?.patient_id as string | undefined
    if (!patientId) {
      failed++
      errors.push(`care_plan_reminders.${(reminder as any).id}: no patient_id on care_plan`)
      continue
    }

    try {
      // ── Get patient + clinic details ─────────────────────────────────────
      const [patientRes, clinicRes] = await Promise.all([
        supabase
          .from('patients')
          .select('phone, language_preference, first_name, last_name')
          .eq('id', patientId)
          .single(),
        supabase
          .from('clinics')
          .select('name')
          .eq('id', String((reminder as any).clinic_id))
          .single(),
      ])

      if (patientRes.error || !patientRes.data?.phone) {
        failed++
        errors.push(`No phone for patient ${patientId}`)
        continue
      }

      const patient    = patientRes.data
      const clinicName = clinicRes.data?.name ?? 'your clinic'

      // ── Format message fields ────────────────────────────────────────────
      const phone    = patient.phone.startsWith('91')
        ? patient.phone
        : `91${patient.phone}`
      const language = (patient.language_preference as string) ?? 'en'
      const name     = `${patient.first_name ?? ''} ${patient.last_name ?? ''}`.trim()
      const medicine = String((reminder as any).medicine_name)
      const meal     = formatMealContext((reminder as any).meal_association as string | null)

      // ── Send via MSG91 ───────────────────────────────────────────────────
      // Template: curakin_medicine_reminder_{language}
      // Body params:
      //   {{1}} = patient name
      //   {{2}} = medicine name
      //   {{3}} = meal context  (e.g. "before breakfast")
      //   {{4}} = clinic name   (e.g. "Vishnu Clinic")
      const result = await provider.sendTemplateMessage({
        phone,
        templateName: `curakin_medicine_reminder_${language}`,
        languageCode: language,
        bodyParams:   [name, medicine, meal, clinicName],
      })

      if (result.success) {
        // Mark sent to prevent duplicate sends today
        await supabase
          .from('care_plan_reminders')
          .update({ last_sent_at: new Date().toISOString() })
          .eq('id', (reminder as any).id)

        sent++
        console.log(
          `[send-medicine-reminders] ✓ sent reminder ${(reminder as any).id}` +
          ` — ${medicine} → ${phone}`
        )
      } else {
        failed++
        errors.push(`reminder ${(reminder as any).id}: ${result.errorMessage}`)
        console.error(`[send-medicine-reminders] ✗ failed:`, result.errorMessage)
      }
    } catch (err) {
      failed++
      errors.push(`error on reminder ${(reminder as any).id}: ${String(err)}`)
      console.error('[send-medicine-reminders] unexpected error:', err)
    }
  }

  console.log(`[send-medicine-reminders] Done — sent: ${sent}  failed: ${failed}`)
  return NextResponse.json({
    sent,
    failed,
    errors: errors.length > 0 ? errors : undefined,
  })
}