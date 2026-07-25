// src/features/reminders/actions.ts
'use server'

import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/supabase/profile'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { z } from 'zod'

// ─── Types ────────────────────────────────────────────────────────────────────

export type MedicineReminder = {
  id:               string
  care_plan_id:     string
  clinic_id:        string
  patient_id:       string
  patient_name:     string
  medicine_name:    string
  reminder_time:    string       // HH:MM 24-hour
  meal_association: string | null
  duration_days:    number | null
  reminder_text:    string
  start_date:       string
  end_date:         string | null
  enabled:          boolean
  last_sent_at:     string | null
  created_at:       string
  updated_at:       string
}

export type MedicineWithoutReminder = {
  care_plan_id:  string
  medicine_name: string
  patient_id:    string
  patient_name:  string
  patient_mrn:   string
  frequency:     string | null
  duration:      string | null
}

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const addReminderSchema = z.object({
  patientId:       z.string().uuid(),
  medicineName:    z.string().min(1, 'Medicine name is required').trim(),
  reminderTime:    z.string().regex(/^\d{2}:\d{2}$/, 'Time must be HH:MM'),
  mealAssociation: z.string().optional(),
  durationDays:    z.number().int().positive().nullable(),
})

const updateReminderSchema = z.object({
  reminderId:      z.string().uuid(),
  reminderTime:    z.string().regex(/^\d{2}:\d{2}$/, 'Time must be HH:MM').optional(),
  mealAssociation: z.string().nullable().optional(),
  durationDays:    z.number().int().positive().nullable().optional(),
  enabled:         z.boolean().optional(),
})

export type AddReminderInput    = z.infer<typeof addReminderSchema>
export type UpdateReminderInput = z.infer<typeof updateReminderSchema>

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildReminderText(medicineName: string, mealAssociation?: string | null): string {
  if (!mealAssociation) return `Remember to take ${medicineName}`
  const readable = mealAssociation.replace(/_/g, ' ')
  return `Remember to take ${medicineName} ${readable}`
}

// ─── listRemindersForPatient ──────────────────────────────────────────────────

/**
 * Returns all medicine reminders for a patient, ordered by reminder time.
 * Used by the centralized "Manage Medicine Reminders" section.
 */
export async function listRemindersForPatient(
  patientId: string,
): Promise<{ success: true; data: MedicineReminder[] } | { success: false; error: string }> {
  try {
    const profile  = await requireRole('doctor', 'staff')
    const supabase = createServerSupabaseClient()

    // Join through care_plans to get patient info
    const { data, error } = await supabase
      .from('care_plan_reminders')
      .select(`
        id,
        care_plan_id,
        clinic_id,
        medicine_name,
        reminder_time,
        meal_association,
        duration_days,
        reminder_text,
        start_date,
        end_date,
        enabled,
        last_sent_at,
        created_at,
        updated_at,
        care_plans ( patient_id, patients ( first_name, last_name ) )
      `)
      .eq('clinic_id', profile.clinic_id)
      .eq('reminder_type', 'medicine')
      .not('medicine_name', 'is', null)
      .not('reminder_time', 'is', null)
      .order('reminder_time', { ascending: true })

    if (error) {
      console.error('[listRemindersForPatient]', error)
      return { success: false, error: 'Failed to load reminders.' }
    }

    const rows = (data ?? []) as any[]

    const reminders: MedicineReminder[] = rows
      .filter((row) => {
        const patient = row.care_plans?.patients
        const pid     = row.care_plans?.patient_id
        return pid === patientId && patient
      })
      .map((row) => {
        const patient = row.care_plans?.patients
        return {
          id:               row.id,
          care_plan_id:     row.care_plan_id,
          clinic_id:        row.clinic_id,
          patient_id:       row.care_plans?.patient_id ?? patientId,
          patient_name:     `${patient?.first_name ?? ''} ${patient?.last_name ?? ''}`.trim(),
          medicine_name:    row.medicine_name,
          reminder_time:    row.reminder_time,
          meal_association: row.meal_association,
          duration_days:    row.duration_days,
          reminder_text:    row.reminder_text,
          start_date:       row.start_date,
          end_date:         row.end_date,
          enabled:          row.enabled,
          last_sent_at:     row.last_sent_at,
          created_at:       row.created_at,
          updated_at:       row.updated_at,
        }
      })

    return { success: true, data: reminders }
  } catch (err) {
    console.error('[listRemindersForPatient]', err)
    return { success: false, error: 'Failed to load reminders.' }
  }
}

// ─── addReminder ─────────────────────────────────────────────────────────────

/**
 * Adds a medicine reminder for a patient.
 * Used by: staff dashboard fallback, centralized reminder management.
 */
export async function addReminder(
  input: AddReminderInput,
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const profile = await requireRole('doctor', 'staff')
    const v       = addReminderSchema.parse(input)
    const supabase = createServerSupabaseClient()

    // Find or create care plan
    let carePlanId: string | null = null

    const { data: existingPlan } = await supabase
      .from('care_plans')
      .select('id')
      .eq('patient_id', v.patientId)
      .eq('clinic_id', profile.clinic_id)
      .single()

    if (existingPlan) {
      carePlanId = existingPlan.id
    } else {
      const { data: newPlan, error: cpError } = await supabase
        .from('care_plans')
        .insert({
          clinic_id:     profile.clinic_id,
          patient_id:    v.patientId,
          created_by_id: profile.id,
        })
        .select('id')
        .single()

      if (cpError || !newPlan) {
        console.error('[addReminder] createCarePlan', cpError)
        return { success: false, error: 'Could not find or create a care plan for this patient.' }
      }
      carePlanId = newPlan.id
    }

    const today = new Date().toISOString().split('T')[0]

    const { error } = await supabase
      .from('care_plan_reminders')
      .insert({
        care_plan_id:     carePlanId,
        clinic_id:        profile.clinic_id,
        reminder_type:    'medicine',
        medicine_name:    v.medicineName,
        reminder_time:    v.reminderTime,
        meal_association: v.mealAssociation ?? null,
        duration_days:    v.durationDays,
        reminder_text:    buildReminderText(v.medicineName, v.mealAssociation),
        frequency:        'daily',
        start_date:       today,
        end_date:         null,
        enabled:          true,
      })

    if (error) {
      console.error('[addReminder]', error)
      return { success: false, error: 'Failed to add reminder.' }
    }

    revalidatePath(`/dashboard/patients/${v.patientId}`)
    return { success: true }
  } catch (err) {
    console.error('[addReminder]', err)
    return { success: false, error: 'Unexpected error adding reminder.' }
  }
}

// ─── updateReminder ───────────────────────────────────────────────────────────

/**
 * Updates an existing medicine reminder.
 * Doctors/staff can change time, meal association, duration, or toggle enabled.
 */
export async function updateReminder(
  input: UpdateReminderInput,
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const profile = await requireRole('doctor', 'staff')
    const v       = updateReminderSchema.parse(input)
    const supabase = createServerSupabaseClient()

    // Verify ownership — reminder must belong to this clinic
    const { data: existing, error: fetchError } = await supabase
      .from('care_plan_reminders')
      .select('id, medicine_name, meal_association')
      .eq('id', v.reminderId)
      .eq('clinic_id', profile.clinic_id)
      .single()

    if (fetchError || !existing) {
      return { success: false, error: 'Reminder not found.' }
    }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }

    if (v.reminderTime    !== undefined) patch.reminder_time    = v.reminderTime
    if (v.mealAssociation !== undefined) patch.meal_association = v.mealAssociation
    if (v.durationDays    !== undefined) patch.duration_days    = v.durationDays
    if (v.enabled         !== undefined) patch.enabled          = v.enabled

    // Rebuild reminder_text if medicine name or meal association changed
    const newMeal = v.mealAssociation !== undefined
      ? v.mealAssociation
      : existing.meal_association
    patch.reminder_text = buildReminderText(existing.medicine_name, newMeal ?? undefined)

    const { error } = await supabase
      .from('care_plan_reminders')
      .update(patch)
      .eq('id', v.reminderId)
      .eq('clinic_id', profile.clinic_id)

    if (error) {
      console.error('[updateReminder]', error)
      return { success: false, error: 'Failed to update reminder.' }
    }

    revalidatePath('/dashboard/patients')
    return { success: true }
  } catch (err) {
    console.error('[updateReminder]', err)
    return { success: false, error: 'Unexpected error updating reminder.' }
  }
}

// ─── deleteReminder ───────────────────────────────────────────────────────────

/**
 * Permanently removes a medicine reminder.
 */
export async function deleteReminder(
  reminderId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const profile  = await requireRole('doctor', 'staff')
    const supabase = createServerSupabaseClient()

    const { error } = await supabase
      .from('care_plan_reminders')
      .delete()
      .eq('id', reminderId)
      .eq('clinic_id', profile.clinic_id)
      .eq('reminder_type', 'medicine')

    if (error) {
      console.error('[deleteReminder]', error)
      return { success: false, error: 'Failed to delete reminder.' }
    }

    revalidatePath('/dashboard/patients')
    return { success: true }
  } catch (err) {
    console.error('[deleteReminder]', err)
    return { success: false, error: 'Unexpected error deleting reminder.' }
  }
}

// ─── getMedicinesWithoutReminders ─────────────────────────────────────────────

/**
 * Returns medicines in the clinic that have no active reminders set.
 * Used by the staff dashboard "Incomplete: Reminders not set" section.
 */
type MedicinesResult =
  | { success: true; data: MedicineWithoutReminder[] }
  | { success: false; error: string }

export async function getMedicinesWithoutReminders(): Promise<MedicinesResult> {
  try {
    const profile  = await requireRole('doctor', 'staff')
    const supabase = createServerSupabaseClient()

    // Get all active care plan medicines for this clinic
    const { data: medicines, error: medError } = await supabase
      .from('care_plan_medicines')
      .select(`
        id,
        care_plan_id,
        medicine_name,
        frequency,
        duration_value,
        duration_unit,
        care_plans (
          patient_id,
          patients ( first_name, last_name, patient_id_number )
        )
      `)
      .eq('clinic_id', profile.clinic_id)
      .order('created_at', { ascending: false })
      .limit(200)

    if (medError) {
      console.error('[getMedicinesWithoutReminders] medicines', medError)
      return { success: false, error: 'Failed to load medicines.' }
    }

    // Get all active reminder medicine names for this clinic
    const { data: reminders, error: remError } = await supabase
      .from('care_plan_reminders')
      .select('care_plan_id, medicine_name')
      .eq('clinic_id', profile.clinic_id)
      .eq('reminder_type', 'medicine')
      .eq('enabled', true)
      .not('medicine_name', 'is', null)

    if (remError) {
      console.error('[getMedicinesWithoutReminders] reminders', remError)
      return { success: false, error: 'Failed to load reminders.' }
    }

    // Build a set of "care_plan_id:medicine_name" combinations that already have reminders
    const reminderSet = new Set(
      (reminders ?? []).map((r: any) => `${r.care_plan_id}:${r.medicine_name}`)
    )

    // Filter medicines that have no matching reminder
    const withoutReminders: MedicineWithoutReminder[] = (medicines ?? [])
      .filter((m: any) => {
        const key = `${m.care_plan_id}:${m.medicine_name}`
        return !reminderSet.has(key)
      })
      .map((m: any) => {
        const patient = m.care_plans?.patients
        const dv = m.duration_value
        const du = m.duration_unit
        const duration = dv != null
          ? `${dv}${du ? ' ' + du : ''}`.trim()
          : (du ?? null)

        return {
          care_plan_id:  m.care_plan_id,
          medicine_name: m.medicine_name,
          patient_id:    m.care_plans?.patient_id ?? '',
          patient_name:  `${patient?.first_name ?? ''} ${patient?.last_name ?? ''}`.trim(),
          patient_mrn:   patient?.patient_id_number ?? 'N/A',
          frequency:     m.frequency ?? null,
          duration:      duration,
        }
      })
      .filter((m) => m.patient_id !== '')

    return { success: true, data: withoutReminders }
  } catch (err) {
    console.error('[getMedicinesWithoutReminders]', err)
    return { success: false, error: 'Unexpected error loading incomplete reminders.' }
  }
}

// ─── getDueReminders ─────────────────────────────────────────────────────────

/**
 * Called by the cron job. Returns reminders due to be sent right now (IST).
 * A reminder is due when:
 *   1. enabled = true
 *   2. reminder_type = 'medicine'
 *   3. reminder_time matches current IST hour:minute
 *   4. last_sent_at is NOT today (prevents duplicate sends)
 *   5. today is within [start_date, start_date + duration_days] (or ongoing if null)
 *
 * Uses service role key — not callable by end users, only the cron route.
 */
export async function getDueReminders(nowIST: Date): Promise<{
  success: true
  data: Array<{
    id:            string
    clinic_id:     string
    patient_id:    string
    medicine_name: string
    reminder_text: string
    reminder_time: string
  }>
} | { success: false; error: string }> {
  try {
    const supabase = createServerSupabaseClient()

    // Current IST time as HH:MM
    const istHour   = String(nowIST.getHours()).padStart(2, '0')
    const istMinute = String(nowIST.getMinutes()).padStart(2, '0')
    const currentTime = `${istHour}:${istMinute}`
    const todayStr    = nowIST.toISOString().split('T')[0]

    const { data, error } = await supabase
      .from('care_plan_reminders')
      .select(`
        id,
        clinic_id,
        care_plan_id,
        medicine_name,
        reminder_text,
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

    if (error) {
      console.error('[getDueReminders]', error)
      return { success: false, error: 'Failed to query due reminders.' }
    }

    const due = (data ?? []).filter((row: any) => {
      // Skip if already sent today
      if (row.last_sent_at) {
        const lastSentDate = row.last_sent_at.split('T')[0]
        if (lastSentDate === todayStr) return false
      }

      // Skip if past duration
      if (row.duration_days != null && row.start_date) {
        const startDate  = new Date(row.start_date)
        const endDate    = new Date(startDate)
        endDate.setDate(endDate.getDate() + row.duration_days)
        const today      = new Date(todayStr)
        if (today > endDate) return false
      }

      return true
    })

    return {
      success: true,
      data: due.map((row: any) => ({
        id:            row.id,
        clinic_id:     row.clinic_id,
        patient_id:    row.care_plans?.patient_id ?? '',
        medicine_name: row.medicine_name,
        reminder_text: row.reminder_text,
        reminder_time: row.reminder_time,
      })).filter((r) => r.patient_id !== ''),
    }
  } catch (err) {
    console.error('[getDueReminders]', err)
    return { success: false, error: 'Unexpected error fetching due reminders.' }
  }
}

// ─── markReminderSent ─────────────────────────────────────────────────────────

/**
 * Updates last_sent_at on a reminder after successful WhatsApp send.
 * Called by the cron job only.
 */
export async function markReminderSent(
  reminderId: string,
): Promise<void> {
  try {
    const supabase = createServerSupabaseClient()
    await supabase
      .from('care_plan_reminders')
      .update({ last_sent_at: new Date().toISOString() })
      .eq('id', reminderId)
  } catch (err) {
    console.error('[markReminderSent]', err)
  }
}