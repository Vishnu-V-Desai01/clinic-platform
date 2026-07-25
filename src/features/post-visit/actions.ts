// src/features/post-visit/actions.ts
'use server'

import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/supabase/profile'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { generateAndStorePaymentDocuments } from '@/features/payments/document-storage'
import { createReceiptMessage } from '@/features/messaging/actions'
import { completeVisitSchema } from './schema'
import type {
  CompleteVisitPayload,
  CompleteVisitResult,
  PrefillResult,
  PrescriptionLine,
  MedicineReminderTime,
} from './types'

// ─── Private helpers ──────────────────────────────────────────────────────────

function parseDosage(dosage: string | undefined): {
  strength: string | null
  unit: string | null
} {
  if (!dosage?.trim()) return { strength: null, unit: null }
  const trimmed  = dosage.trim()
  const spaceIdx = trimmed.indexOf(' ')
  if (spaceIdx === -1) return { strength: trimmed, unit: null }
  return {
    strength: trimmed.slice(0, spaceIdx),
    unit:     trimmed.slice(spaceIdx + 1),
  }
}

function parseDuration(duration: string | undefined): {
  duration_value: number | null
  duration_unit:  string | null
} {
  if (!duration?.trim()) return { duration_value: null, duration_unit: null }
  const trimmed = duration.trim()
  const match   = trimmed.match(
    /^(\d+)\s*(day|days|week|weeks|month|months|year|years)$/i,
  )
  if (match) {
    return {
      duration_value: parseInt(match[1], 10),
      duration_unit:  match[2].toLowerCase(),
    }
  }
  return { duration_value: null, duration_unit: trimmed }
}

function descriptionFromLines(lines: Array<{ description: string }>): string {
  if (lines.length === 0) return 'Consultation'
  if (lines.length === 1) return lines[0].description
  return `${lines[0].description} (and ${lines.length - 1} more)`
}

/**
 * Builds a human-readable reminder text for WhatsApp messages.
 * e.g. "Remember to take Aspirin before your breakfast"
 */
function buildReminderText(medicineName: string, mealAssociation?: string): string {
  if (!mealAssociation) return `Remember to take ${medicineName}`
  // Convert "before_breakfast" → "before your breakfast"
  const readable = mealAssociation.replace(/_/g, ' ')
  return `Remember to take ${medicineName} ${readable}`
}

/**
 * Parses a duration string like "7" or "7 days" into an integer number of days.
 * Returns null for ongoing reminders.
 */
function parseDurationDays(duration: string | undefined): number | null {
  if (!duration?.trim()) return null
  const trimmed = duration.trim()
  // Handle plain number like "7"
  const plain = parseInt(trimmed, 10)
  if (!isNaN(plain) && String(plain) === trimmed) return plain
  // Handle "7 days", "2 weeks", "1 month"
  const match = trimmed.match(/^(\d+)\s*(day|days|week|weeks|month|months)$/i)
  if (!match) return null
  const value = parseInt(match[1], 10)
  const unit  = match[2].toLowerCase()
  if (unit.startsWith('week'))  return value * 7
  if (unit.startsWith('month')) return value * 30
  return value
}

// ─── getVisitPrefill ──────────────────────────────────────────────────────────

export async function getVisitPrefill(
  appointmentId: string,
): Promise<PrefillResult> {
  const profile = await requireRole('doctor')

  const clinicId = profile.clinic_id
  if (!clinicId) {
    return { success: false, error: 'Your account is not linked to a clinic.' }
  }

  try {
    const supabase = createServerSupabaseClient()

    const { data: appointment, error: aptError } = await supabase
      .from('appointments')
      .select('patient_id, doctor_id, status')
      .eq('id', appointmentId)
      .eq('clinic_id', clinicId)
      .eq('doctor_id', profile.id)
      .is('deleted_at', null)
      .single()

    if (aptError || !appointment) {
      return { success: false, error: 'Appointment not found or not accessible.' }
    }
    if (appointment.status === 'completed') {
      return { success: false, error: 'This appointment is already complete.' }
    }
    if (appointment.status === 'cancelled') {
      return { success: false, error: 'Cancelled appointments cannot be completed.' }
    }

    const patientId = appointment.patient_id

    const [carePlanRes, settingsRes] = await Promise.all([
      supabase
        .from('care_plans')
        .select('id')
        .eq('patient_id', patientId)
        .eq('clinic_id', clinicId)
        .single(),
      supabase
        .from('clinic_settings')
        .select('*')
        .eq('clinic_id', clinicId)
        .single(),
    ])

    let prescriptions: PrescriptionLine[] = []
    if (carePlanRes.data) {
      const { data: medicines } = await supabase
        .from('care_plan_medicines')
        .select('*')
        .eq('care_plan_id', carePlanRes.data.id)
        .order('created_at', { ascending: true })

      prescriptions = (medicines ?? []).map(
        (m: Record<string, unknown>): PrescriptionLine => {
          const strengthStr = typeof m.strength === 'string' ? m.strength : null
          const unitStr     = typeof m.unit     === 'string' ? m.unit     : null
          const dosage = strengthStr
            ? `${strengthStr}${unitStr ? ' ' + unitStr : ''}`.trim()
            : undefined

          const dv = typeof m.duration_value === 'number' ? m.duration_value : null
          const du = typeof m.duration_unit  === 'string' ? m.duration_unit  : null
          const duration = dv != null
            ? `${dv}${du ? ' ' + du : ''}`.trim()
            : (du ?? undefined)

          return {
            localId:            crypto.randomUUID(),
            carePlanMedicineId: typeof m.id === 'string' ? m.id : undefined,
            medicineName:       typeof m.medicine_name === 'string' ? m.medicine_name : '',
            dosage:             dosage ?? undefined,
            frequency:          typeof m.frequency    === 'string' ? m.frequency    : undefined,
            duration:           typeof duration       === 'string' ? duration       : undefined,
            instructions:       typeof m.instructions === 'string' ? m.instructions : undefined,
            mealAssociation:    undefined,
            mealTiming:         undefined,
            status:             'active',
            isDeleted:          false,
          }
        },
      )
    }

    const reminderTimes: MedicineReminderTime[] = []

    const settings = settingsRes.data as Record<string, unknown> | null
    const defaultFee: number | undefined =
      typeof settings?.consultation_fee             === 'number'
        ? settings.consultation_fee
        : typeof settings?.default_consultation_fee === 'number'
          ? settings.default_consultation_fee
          : undefined

    return {
      success: true,
      data:    { patientId, prescriptions, reminderTimes, defaultFee },
    }
  } catch (err) {
    console.error('[getVisitPrefill]', err)
    return { success: false, error: 'Failed to load visit data. Please try again.' }
  }
}

// ─── completeVisit ────────────────────────────────────────────────────────────

export async function completeVisit(
  payload: CompleteVisitPayload,
): Promise<CompleteVisitResult> {
  const profile = await requireRole('doctor')

  const clinicId = profile.clinic_id
  if (!clinicId) {
    return { success: false, error: 'Your account is not linked to a clinic.' }
  }

  try {
    const parsed = completeVisitSchema.safeParse(payload)
    if (!parsed.success) {
      return {
        success: false,
        error:   parsed.error.issues[0]?.message ?? 'Invalid submission data.',
      }
    }
    const data     = parsed.data
    const supabase = createServerSupabaseClient()
    const warnings: string[] = []

    let encounterId: string | undefined
    let paymentId:   string | undefined

    const { data: appointment, error: aptError } = await supabase
      .from('appointments')
      .select('patient_id, doctor_id, status')
      .eq('id', data.appointmentId)
      .eq('clinic_id', clinicId)
      .eq('doctor_id', profile.id)
      .is('deleted_at', null)
      .single()

    if (aptError || !appointment) {
      return { success: false, error: 'Appointment not found or not accessible.' }
    }
    if (appointment.status === 'completed') {
      return { success: false, error: 'This appointment was already completed.' }
    }
    if (appointment.status === 'cancelled') {
      return { success: false, error: 'Cancelled appointments cannot be completed.' }
    }

    const patientId = data.patientId

    // ════════════════════════════════════════════════════════════════════════
    // STEP A — Care-plan sync
    // ════════════════════════════════════════════════════════════════════════
    if (data.prescriptions !== null) {
      const deleted = data.prescriptions.filter(
        (p) => p.isDeleted && p.carePlanMedicineId,
      )
      const updated = data.prescriptions.filter(
        (p) => !p.isDeleted && p.carePlanMedicineId,
      )
      const created = data.prescriptions.filter(
        (p) => !p.isDeleted && !p.carePlanMedicineId,
      )

      for (const rx of deleted) {
        const { error } = await supabase
          .from('care_plan_medicines')
          .delete()
          .eq('id', rx.carePlanMedicineId!)
          .eq('clinic_id', clinicId)
        if (error) {
          console.error('[completeVisit] deleteMedicine', error)
          warnings.push(`Could not remove "${rx.medicineName}" from care plan.`)
        }
      }

      for (const rx of updated) {
        const { strength, unit }               = parseDosage(rx.dosage)
        const { duration_value, duration_unit } = parseDuration(rx.duration)
        const { error } = await supabase
          .from('care_plan_medicines')
          .update({
            medicine_name: rx.medicineName,
            strength,
            unit,
            frequency:     rx.frequency    ?? null,
            duration_value,
            duration_unit,
            instructions:  rx.instructions ?? null,
            updated_at:    new Date().toISOString(),
          })
          .eq('id', rx.carePlanMedicineId!)
          .eq('clinic_id', clinicId)
        if (error) {
          console.error('[completeVisit] updateMedicine', error)
          warnings.push(`Could not update "${rx.medicineName}" in care plan.`)
        }
      }

      if (created.length > 0) {
        let carePlanId: string | null = null
        const { data: existingPlan } = await supabase
          .from('care_plans')
          .select('id')
          .eq('patient_id', patientId)
          .eq('clinic_id', clinicId)
          .single()

        if (existingPlan) {
          carePlanId = existingPlan.id
        } else {
          const { data: newPlan, error: cpError } = await supabase
            .from('care_plans')
            .insert({ clinic_id: clinicId, patient_id: patientId, created_by_id: profile.id })
            .select('id')
            .single()
          if (cpError || !newPlan) {
            console.error('[completeVisit] createCarePlan', cpError)
            warnings.push('Could not create care plan for newly prescribed medicines.')
          } else {
            carePlanId = newPlan.id
          }
        }

        if (carePlanId) {
          for (const rx of created) {
            const { strength, unit }               = parseDosage(rx.dosage)
            const { duration_value, duration_unit } = parseDuration(rx.duration)
            const { error } = await supabase
              .from('care_plan_medicines')
              .insert({
                care_plan_id:  carePlanId,
                clinic_id:     clinicId,
                medicine_name: rx.medicineName,
                strength,
                unit,
                frequency:     rx.frequency    ?? null,
                duration_value,
                duration_unit,
                instructions:  rx.instructions ?? null,
              })
            if (error) {
              console.error('[completeVisit] addMedicine', error)
              warnings.push(`Could not add "${rx.medicineName}" to care plan.`)
            }
          }
        }
      }
    }

    // ════════════════════════════════════════════════════════════════════════
    // STEP B — Medicine reminders
    // Saves to care_plan_reminders using the new medicine-specific columns.
    // medicine_name  = the medicine being reminded
    // reminder_time  = HH:MM 24-hour format (set by doctor in the wizard)
    // meal_association = optional meal context (e.g. before_breakfast)
    // duration_days  = how many days to send (null = ongoing)
    // reminder_text  = human-readable text for WhatsApp message body
    // ════════════════════════════════════════════════════════════════════════
    if (data.reminderTimes !== null && data.reminderTimes.length > 0) {
      let carePlanId: string | null = null

      const { data: existingPlan } = await supabase
        .from('care_plans')
        .select('id')
        .eq('patient_id', patientId)
        .eq('clinic_id', clinicId)
        .single()

      if (existingPlan) {
        carePlanId = existingPlan.id
      } else {
        const { data: newPlan, error: cpError } = await supabase
          .from('care_plans')
          .insert({ clinic_id: clinicId, patient_id: patientId, created_by_id: profile.id })
          .select('id')
          .single()
        if (cpError || !newPlan) {
          console.error('[completeVisit] createCarePlan for reminders', cpError)
          warnings.push('Could not create care plan for reminders.')
        } else {
          carePlanId = newPlan.id
        }
      }

      if (carePlanId) {
        const today = new Date().toISOString().split('T')[0]

        const { error: remError } = await supabase
          .from('care_plan_reminders')
          .insert(
            data.reminderTimes.map((r) => ({
              care_plan_id:     carePlanId!,
              clinic_id:        clinicId,
              reminder_type:    'medicine',
              // new medicine-specific columns
              medicine_name:    r.medicineName,
              reminder_time:    r.time,
              meal_association: r.mealAssociation ?? null,
              duration_days:    parseDurationDays(r.duration),
              // human-readable text for WhatsApp
              reminder_text:    buildReminderText(r.medicineName, r.mealAssociation),
              // generic columns still populated for backwards compatibility
              frequency:        'daily',
              start_date:       today,
              end_date:         null,
              enabled:          true,
            })),
          )

        if (remError) {
          console.error('[completeVisit] reminders', remError)
          warnings.push('Some reminders could not be saved.')
        }
      }
    }

    // ════════════════════════════════════════════════════════════════════════
    // STEP C — Encounter + children
    // ════════════════════════════════════════════════════════════════════════
    if (data.encounter !== null) {
      const enc = data.encounter

      const { data: encounter, error: encError } = await supabase
        .from('encounters')
        .insert({
          clinic_id:       clinicId,
          patient_id:      patientId,
          doctor_id:       profile.id,
          encounter_date:  new Date().toISOString(),
          chief_complaint: enc.chiefComplaint ?? null,
          notes:           enc.notes          ?? null,
          status:          'active',
        })
        .select('id')
        .single()

      if (encError || !encounter) {
        console.error('[completeVisit] createEncounter', encError)
        return {
          success: false,
          error:   'Failed to create encounter record. No data was saved. Please try again.',
        }
      }

      encounterId = encounter.id

      if (enc.diagnoses.length > 0) {
        const { error } = await supabase.from('diagnoses').insert(
          enc.diagnoses.map((d) => ({
            clinic_id:      clinicId,
            encounter_id:   encounterId,
            patient_id:     patientId,
            condition_name: d.conditionName,
            severity:       d.severity ?? null,
            status:         d.status,
            notes:          d.notes    ?? null,
          })),
        )
        if (error) {
          console.error('[completeVisit] diagnoses', error)
          warnings.push('Some diagnoses could not be saved.')
        }
      }

      if (enc.observations.length > 0) {
        const { error } = await supabase.from('observations').insert(
          enc.observations.map((o) => ({
            clinic_id:        clinicId,
            encounter_id:     encounterId,
            patient_id:       patientId,
            observation_type: o.observationType,
            value:            o.value,
            unit:             o.unit  ?? null,
            notes:            o.notes ?? null,
          })),
        )
        if (error) {
          console.error('[completeVisit] observations', error)
          warnings.push('Some vitals / observations could not be saved.')
        }
      }

      const activePrescriptions = (data.prescriptions ?? []).filter((p) => !p.isDeleted)
      if (activePrescriptions.length > 0) {
        const { error } = await supabase.from('prescriptions').insert(
          activePrescriptions.map((p) => ({
            clinic_id:     clinicId,
            encounter_id:  encounterId,
            patient_id:    patientId,
            medicine_name: p.medicineName,
            dosage:        p.dosage       ?? null,
            frequency:     p.frequency    ?? null,
            duration:      p.duration     ?? null,
            instructions:  p.instructions ?? null,
            status:        p.status,
          })),
        )
        if (error) {
          console.error('[completeVisit] encounterPrescriptions', error)
          warnings.push('Some prescriptions could not be saved to the encounter record.')
        }
      }
    }

    // ════════════════════════════════════════════════════════════════════════
    // STEP D — Payment (charges)
    // ════════════════════════════════════════════════════════════════════════
    if (data.charges !== null && data.charges.length > 0) {
      const { data: receiptNumber, error: receiptError } = await supabase.rpc(
        'next_receipt_number',
        { p_clinic_id: clinicId },
      )

      if (receiptError || !receiptNumber) {
        console.error('[completeVisit] receiptNumber', receiptError)
        warnings.push(
          'Could not generate a receipt number; charges were not saved. ' +
          'You can add charges manually from the Payments screen.',
        )
      } else {
        const totalAmount = data.charges.reduce(
          (sum, item) => sum + item.quantity * item.unitPrice,
          0,
        )
        const description = descriptionFromLines(data.charges)

        const { data: payment, error: payError } = await supabase
          .from('payments')
          .insert({
            clinic_id:       clinicId,
            patient_id:      patientId,
            appointment_id:  data.appointmentId,
            doctor_id:       profile.id,
            description,
            amount_charged:  totalAmount,
            amount_paid:     0,
            approval_status: 'approved',
            approved_by:     profile.id,
            approved_at:     new Date().toISOString(),
            created_by:      profile.id,
            receipt_number:  receiptNumber,
          })
          .select('id')
          .single()

        if (payError || !payment) {
          console.error('[completeVisit] createPayment', payError)
          warnings.push('Charges could not be saved. You can add them from the Payments screen.')
        } else {
          paymentId = payment.id

          const { error: liError } = await supabase
            .from('payment_line_items')
            .insert(
              data.charges.map((item, idx) => ({
                clinic_id:   clinicId,
                payment_id:  paymentId!,
                description: item.description,
                quantity:    item.quantity,
                unit_price:  item.unitPrice,
                sort_order:  idx,
              })),
            )
          if (liError) {
            console.error('[completeVisit] lineItems', liError)
            warnings.push('Payment was created but line item details could not be saved.')
          }

          try {
            await generateAndStorePaymentDocuments(paymentId!)
          } catch (docErr) {
            console.error('[completeVisit] generateDocs', docErr)
          }
          try {
            await createReceiptMessage({ paymentId: paymentId! })
          } catch (msgErr) {
            console.error('[completeVisit] receiptMessage', msgErr)
          }
        }
      }
    }

    // ════════════════════════════════════════════════════════════════════════
    // STEP E — Mark appointment complete
    // ════════════════════════════════════════════════════════════════════════
    const { error: completeError } = await supabase
      .from('appointments')
      .update({
        status:       'completed',
        completed_at: new Date().toISOString(),
        updated_at:   new Date().toISOString(),
      })
      .eq('id', data.appointmentId)
      .eq('clinic_id', clinicId)
      .eq('status', 'scheduled')

    if (completeError) {
      console.error('[completeVisit] markComplete', completeError)
      return {
        success: false,
        error:
          'Records were saved but the appointment could not be marked complete. ' +
          'Please refresh the page and try again.',
      }
    }

    revalidatePath('/dashboard/appointments')
    revalidatePath(`/dashboard/patients/${patientId}`)
    revalidatePath('/dashboard/payments')

    return {
      success:    true,
      encounterId,
      paymentId,
      warnings:   warnings.length > 0 ? warnings : undefined,
    }
  } catch (err) {
    console.error('[completeVisit]', err)
    return { success: false, error: 'An unexpected error occurred. Please try again.' }
  }
}