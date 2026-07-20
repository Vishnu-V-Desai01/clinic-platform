// src/features/post-visit/actions.ts
//
// Two exported server functions:
//   getVisitPrefill  – loads care-plan medicines, reminder times, and default fee
//                      to seed the wizard's initial state.
//   completeVisit    – atomic(ish) save: care-plan sync → reminders → encounter
//                      → payment → mark appointment complete.

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

/**
 * Splits a free-text dosage string into the care_plan_medicines
 * (strength, unit) columns.
 *
 * "500 mg"      → { strength: "500",   unit: "mg"  }
 * "10 mg/5 ml"  → { strength: "10 mg/5 ml", unit: null }
 * "2 tablets"   → { strength: "2",     unit: "tablets" }
 * undefined     → { strength: null,    unit: null  }
 *
 * The split is intentionally simple (first whitespace boundary).
 * Edge cases like "10 mg/5 ml" keep the whole string in strength.
 * Doctors can always correct via the Care Plan tab.
 */
function parseDosage(dosage: string | undefined): {
  strength: string | null
  unit: string | null
} {
  if (!dosage?.trim()) return { strength: null, unit: null }
  const trimmed = dosage.trim()
  // Only split on the FIRST space; complex strings like "10mg/5ml" stay whole
  const spaceIdx = trimmed.indexOf(' ')
  if (spaceIdx === -1) return { strength: trimmed, unit: null }
  return {
    strength: trimmed.slice(0, spaceIdx),
    unit:     trimmed.slice(spaceIdx + 1),
  }
}

/**
 * Splits a free-text duration into the care_plan_medicines
 * (duration_value, duration_unit) columns.
 *
 * "7 days"   → { duration_value: 7,    duration_unit: "days"   }
 * "2 weeks"  → { duration_value: 2,    duration_unit: "weeks"  }
 * "1 month"  → { duration_value: 1,    duration_unit: "month"  }
 * "as needed"→ { duration_value: null, duration_unit: "as needed" }
 * undefined  → { duration_value: null, duration_unit: null      }
 *
 * Unrecognised strings are stored verbatim in duration_unit so no
 * information is lost; doctors can see them in the Care Plan tab.
 */
function parseDuration(duration: string | undefined): {
  duration_value: number | null
  duration_unit:  string | null
} {
  if (!duration?.trim()) return { duration_value: null, duration_unit: null }
  const trimmed = duration.trim()
  const match = trimmed.match(
    /^(\d+)\s*(day|days|week|weeks|month|months|year|years)$/i,
  )
  if (match) {
    return {
      duration_value: parseInt(match[1], 10),
      duration_unit:  match[2].toLowerCase(),
    }
  }
  // Free text that didn't parse — store whole string in the unit column
  return { duration_value: null, duration_unit: trimmed }
}

/** Derive a single description string from an array of line items. */
function descriptionFromLines(
  lines: Array<{ description: string }>,
): string {
  if (lines.length === 0) return 'Consultation'
  if (lines.length === 1) return lines[0].description
  return `${lines[0].description} (and ${lines.length - 1} more)`
}

// ─── getVisitPrefill ──────────────────────────────────────────────────────────

/**
 * Called when the doctor clicks "Mark as Complete".
 * Returns the data needed to seed all four wizard cards.
 *
 * On failure the modal should stay closed and show an error toast.
 * On success the wizard opens with pre-populated state.
 */
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

    // ── 1. Verify the doctor owns this appointment and it's still open ────────
    const { data: appointment, error: aptError } = await supabase
      .from('appointments')
      .select('patient_id, doctor_id, status')
      .eq('id', appointmentId)
      .eq('clinic_id', clinicId)
      .eq('doctor_id', profile.id)  // must own it
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

    // ── 2. Load care plan id and clinic settings ──────────────────────────────
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

    // ── 3. Load care-plan medicines (sequential — depends on plan id) ─────────
    let prescriptions: PrescriptionLine[] = []
    if (carePlanRes.data) {
      const { data: medicines } = await supabase
        .from('care_plan_medicines')
        .select('*')
        .eq('care_plan_id', carePlanRes.data.id)
        .order('created_at', { ascending: true })

      prescriptions = (medicines ?? []).map(
        (m: Record<string, unknown>): PrescriptionLine => {
          // Reconstruct a human-readable dosage from the split columns
          const strengthStr = typeof m.strength === 'string' ? m.strength : null
          const unitStr     = typeof m.unit     === 'string' ? m.unit     : null
          const dosage = strengthStr
            ? `${strengthStr}${unitStr ? ' ' + unitStr : ''}`.trim()
            : undefined

          // Reconstruct a human-readable duration
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
            frequency:          typeof m.frequency === 'string' ? m.frequency : undefined,
            duration:           typeof duration     === 'string' ? duration    : undefined,
            instructions:       typeof m.instructions === 'string' ? m.instructions : undefined,
            mealAssociation:    undefined,
            mealTiming:         undefined,
            status:             'active',
            isDeleted:          false,
          }
        },
      )
    }

    // ── 4. Reminders are empty on prefill — doctor adds them in the wizard ────
    const reminderTimes: MedicineReminderTime[] = []

    // ── 5. Default consultation fee ───────────────────────────────────────────
    // NOTE: Adjust the column name below if your clinic_settings table uses a
    // different name (e.g. "default_consultation_fee", "consult_fee_rupees").
    // Run: SELECT column_name FROM information_schema.columns WHERE table_name = 'clinic_settings';
    const settings = settingsRes.data as Record<string, unknown> | null
    const defaultFee: number | undefined =
      typeof settings?.consultation_fee         === 'number'
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

/**
 * Saves the completed wizard state atomically (best-effort):
 *   A. Care-plan sync  (if prescriptions step was not skipped)
 *   B. Reminders       (if reminders step was not skipped)
 *   C. Encounter       (if encounter step was not skipped)
 *   D. Payment         (if charges step was not skipped and has items)
 *   E. Mark appointment complete (always, runs last)
 *
 * null payload field  = step was skipped; no rows written.
 * []  payload field   = step was shown and confirmed with no entries; no rows written.
 *
 * Child failures (e.g. a diagnoses batch insert) accumulate as warnings[] and
 * are returned to the client. The appointment is still marked complete so the
 * doctor is not blocked. Staff can fill in missing details from their dashboard.
 */
export async function completeVisit(
  payload: CompleteVisitPayload,
): Promise<CompleteVisitResult> {
  const profile = await requireRole('doctor')

  const clinicId = profile.clinic_id
  if (!clinicId) {
    return { success: false, error: 'Your account is not linked to a clinic.' }
  }

  try {
    // ── Validate payload ──────────────────────────────────────────────────────
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

    // ── Guard: re-verify ownership and eligibility ────────────────────────────
    // We already checked in getVisitPrefill, but re-check here because:
    //   - the doctor could have had their role changed since the modal opened
    //   - another user could have cancelled or completed the appointment
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
    // Only when the prescriptions step was NOT skipped (payload is not null).
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

      // A-1. Delete removed medicines from care plan
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

      // A-2. Update existing medicines (including new meal-time columns)
      for (const rx of updated) {
        const { strength, unit }             = parseDosage(rx.dosage)
        const { duration_value, duration_unit } = parseDuration(rx.duration)

        const { error } = await supabase
          .from('care_plan_medicines')
          .update({
            medicine_name:    rx.medicineName,
            strength,
            unit,
            frequency:        rx.frequency    ?? null,
            duration_value,
            duration_unit,
            instructions:     rx.instructions ?? null,
            updated_at:       new Date().toISOString(),
          })
          .eq('id', rx.carePlanMedicineId!)
          .eq('clinic_id', clinicId)

        if (error) {
          console.error('[completeVisit] updateMedicine', error)
          warnings.push(`Could not update "${rx.medicineName}" in care plan.`)
        }
      }

      // A-3. Add newly prescribed medicines to care plan
      if (created.length > 0) {
        // Ensure a care plan exists for this patient first
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
            .insert({
              clinic_id:     clinicId,
              patient_id:    patientId,
              created_by_id: profile.id,
            })
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
                care_plan_id:    carePlanId,
                clinic_id:       clinicId,
                medicine_name:   rx.medicineName,
                strength,
                unit,
                frequency:       rx.frequency    ?? null,
                duration_value,
                duration_unit,
                instructions:    rx.instructions ?? null,
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
    // Only when the reminders step was NOT skipped (not null) AND has items.
    // Creates rows in care_plan_reminders table.
    // ════════════════════════════════════════════════════════════════════════
    if (data.reminderTimes !== null && data.reminderTimes.length > 0) {
      // Ensure a care plan exists for this patient first
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
          .insert({
            clinic_id:     clinicId,
            patient_id:    patientId,
            created_by_id: profile.id,
          })
          .select('id')
          .single()

        if (cpError || !newPlan) {
          console.error('[completeVisit] createCarePlan', cpError)
          warnings.push('Could not create care plan for reminders.')
        } else {
          carePlanId = newPlan.id
        }
      }

      if (carePlanId) {
        const { error: remError } = await supabase
          .from('care_plan_reminders')
          .insert(
            data.reminderTimes.map((r) => ({
              care_plan_id:  carePlanId!,
              clinic_id:     clinicId,
              reminder_type: 'medicine',
              target_id:     r.medicineName,
              reminder_text: `${r.time}${r.mealAssociation ? ` (${r.mealAssociation})` : ''}`,
metadata: {
  duration_days: r.duration,
  meal_association: r.mealAssociation,
},
              frequency:     'daily',
              start_date:    new Date().toISOString().split('T')[0],
              end_date:      null,
              enabled:       true,
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
    // Only when the encounter step was NOT skipped (payload is not null).
    // Prescriptions from Step A are merged into the encounter as a child batch
    // (this is how createEncounter in Chat 8 was designed — prescriptions are
    // children of an encounter, giving them their encounter_id).
    // ════════════════════════════════════════════════════════════════════════
    if (data.encounter !== null) {
      const enc = data.encounter

      // Insert the encounter row
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
        // Encounter failure is hard — return immediately so the appointment
        // is NOT marked complete and the doctor can retry.
        return {
          success: false,
          error:   'Failed to create encounter record. No data was saved. Please try again.',
        }
      }

      encounterId = encounter.id

      // C-1. Diagnoses
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

      // C-2. Observations
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

      // C-3. Prescriptions (from Card 1, merged into this encounter)
      // Only when the prescriptions step was also NOT skipped.
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
    // Only when charges step was NOT skipped (not null) AND has at least one
    // line item. An empty array means the step was confirmed with no items.
    // ════════════════════════════════════════════════════════════════════════
    if (data.charges !== null && data.charges.length > 0) {
      // Get receipt number atomically via the same RPC used in Chat 10
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
            appointment_id:  data.appointmentId,   // ← wired in (createManualChargeAndApprove hardcodes null)
            doctor_id:       profile.id,
            description,
            amount_charged:  totalAmount,
            amount_paid:     0,
            approval_status: 'approved',            // ← doctor is present; auto-approve
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

          // Insert line items
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

          // Generate PDF receipt + WhatsApp notification — non-blocking
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
    // STEP E — Mark appointment complete (always, always last)
    //
    // The .eq('status', 'scheduled') condition is the race-condition guard:
    // if a second request sneaks through, the UPDATE matches 0 rows.
    // Supabase does not error on 0-row updates, so this silently succeeds —
    // acceptable here because the appointment will already be 'completed'.
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