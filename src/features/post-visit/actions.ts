// src/features/post-visit/actions.ts
//
// Issue 5 (debugging chat): getVisitPrefill and completeVisit now support
// EDITING an already-completed appointment, not just completing a scheduled
// one for the first time. Key changes from the original version:
//
//   - Role gate widened from doctor-only to doctor/staff, with permission
//     resolved per-caller via resolvePermissions() below:
//       * Admin: full access — clinical fields + charges, always auto-approved
//       * Treating doctor (appointments.doctor_id === caller): same as admin
//       * Any other doctor: NO access to this appointment at all (unchanged
//         behavior — a doctor could never touch another doctor's visit)
//       * Staff: charges only, always submitted as approval_status='pending'
//         (Option A — reuses the existing charge-approval queue, same as any
//         staff-created charge elsewhere in the app), no access to clinical
//         fields at all
//
//   - "Edit mode" is detected by an existing encounters row linked via the
//     new encounters.appointment_id column (added this chat) — NOT by
//     appointment status alone, so a rare partially-saved visit is handled
//     the same way a normal re-edit would be. In edit mode, diagnoses/
//     observations/prescriptions are diffed against what's already saved
//     (create/update/delete per line, same pattern the ORIGINAL version of
//     this file already used for care_plan_medicines) instead of blindly
//     re-inserting duplicates.
//
//   - Charges follow the financial-integrity rule confirmed for Issue 5:
//     editable while approval_status='pending', OR
//     approval_status='approved' AND payment_status='unpaid' (no money
//     collected yet). Once any payment_collections row exists, charges are
//     LOCKED — submitted charge changes are silently skipped (not an error
//     for the whole save) with a warning surfaced instead.
//
//   - encounters.last_edited_by / last_edited_at are stamped on every save
//     that touches the encounter — the audit trail for clinical edits,
//     confirmed to live at the encounter level rather than per-row.
//
//   - Edit window (confirmed, this chat): re-editing an already-completed
//     visit is only allowed within 2 days of the appointment's ORIGINAL
//     scheduled date/time, not from when it was marked complete. Applies
//     to edit mode only — first-time completion is never blocked by this,
//     however overdue. Enforced independently in both getVisitPrefill
//     (so the UI can show a clear message before the user starts editing)
//     and completeVisit (in case the client's prefill data was stale by
//     the time save is submitted).

'use server'

import { revalidatePath } from 'next/cache'
import { getOrCreateProfile } from '@/lib/supabase/profile'
import { createServerSupabaseClient } from '@/lib/supabase/server'
// NOTE: generateAndStorePaymentDocuments / createReceiptMessage are no
// longer called from this file — per the Issue 5 receipt-timing change,
// receipt documents + the WhatsApp receipt message now only fire from
// recordPaymentCollection (payments/actions.ts) on first payment
// collection, not at charge-creation/approval time.
import { completeVisitSchema } from './schema'
import type {
  CompleteVisitPayload,
  CompleteVisitResult,
  PrefillResult,
  PrescriptionLine,
  DiagnosisLine,
  ObservationLine,
  MedicineReminderTime,
  ChargeLineItem,
  EncounterData,
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

// ─── Permission resolution (Issue 5) ───────────────────────────────────────────

type Permissions = {
  canView:                boolean
  canEditClinical:        boolean
  canEditCharges:         boolean // permission only — chargesLocked (money collected) is checked separately
  chargesRequireApproval: boolean
}

function resolvePermissions(
  profile: { id: string; role: string; is_clinic_admin: boolean },
  appointment: { doctor_id: string },
): Permissions {
  const isAdmin          = profile.is_clinic_admin
  const isTreatingDoctor = profile.role === 'doctor' && appointment.doctor_id === profile.id
  const isStaff          = profile.role === 'staff'
  const isOtherDoctor    = profile.role === 'doctor' && !isTreatingDoctor

  if (isOtherDoctor && !isAdmin) {
    // A doctor who isn't the treating doctor and isn't an admin has no
    // access to this appointment at all — same restriction as the
    // original version of this file (doctor_id filter on the fetch).
    return { canView: false, canEditClinical: false, canEditCharges: false, chargesRequireApproval: false }
  }

  return {
    canView:                true,
    canEditClinical:        isAdmin || isTreatingDoctor,
    canEditCharges:         isAdmin || isTreatingDoctor || isStaff,
    chargesRequireApproval: isStaff && !isAdmin && !isTreatingDoctor,
  }
}

// Financial-integrity rule (matches updatePaymentAmount in payments/actions.ts):
// editable while pending, or approved-but-nothing-collected-yet. Locked the
// moment any payment_collections row exists for this payment.
function isChargeEditable(payment: { approval_status: string; payment_status: string } | null): boolean {
  if (!payment) return true // no charge yet — always "editable" (i.e. creatable)
  return (
    payment.approval_status === 'pending' ||
    (payment.approval_status === 'approved' && payment.payment_status === 'unpaid')
  )
}

// Edit window (confirmed): re-editing an already-completed visit is only
// allowed within 2 days of the appointment's original scheduled date/time
// — NOT from when it was marked complete. Applies to EDIT mode only; a
// scheduled appointment being completed for the FIRST time is never
// blocked by this, however overdue it is — this window exists to bound
// how long clinical/charge history can be corrected after the fact, not
// to prevent late first-time completion.
const EDIT_WINDOW_MS = 2 * 24 * 60 * 60 * 1000

function isWithinEditWindow(appointmentDateISO: string): boolean {
  const appointmentTime = new Date(appointmentDateISO).getTime()
  return Date.now() - appointmentTime <= EDIT_WINDOW_MS
}

// ─── getVisitPrefill ──────────────────────────────────────────────────────────

export async function getVisitPrefill(
  appointmentId: string,
): Promise<PrefillResult> {
  const profile = await getOrCreateProfile()
  if (!profile || !['doctor', 'staff'].includes(profile.role)) {
    return { success: false, error: 'Unauthorized.' }
  }

  const clinicId = profile.clinic_id
  if (!clinicId) {
    return { success: false, error: 'Your account is not linked to a clinic.' }
  }

  try {
    const supabase = createServerSupabaseClient()

    const { data: appointment, error: aptError } = await supabase
      .from('appointments')
      .select('patient_id, doctor_id, status, appointment_date')
      .eq('id', appointmentId)
      .eq('clinic_id', clinicId)
      .is('deleted_at', null)
      .single()

    if (aptError || !appointment) {
      return { success: false, error: 'Appointment not found or not accessible.' }
    }
    if (appointment.status === 'cancelled') {
      return { success: false, error: 'Cancelled appointments cannot be completed or edited.' }
    }

    const perms = resolvePermissions(profile, appointment)
    if (!perms.canView) {
      return { success: false, error: 'You do not have access to this appointment.' }
    }

    const patientId = appointment.patient_id

    // Look up an existing encounter for THIS appointment specifically —
    // its presence is what determines edit mode, not appointment.status.
    const { data: existingEncounter } = await supabase
      .from('encounters')
      .select('id, chief_complaint, notes')
      .eq('appointment_id', appointmentId)
      .eq('clinic_id', clinicId)
      .maybeSingle()

    const isEditMode = !!existingEncounter

    // 2-day edit window (confirmed) — only applies in edit mode, only
    // counts from the appointment's original date/time, never blocks
    // first-time completion.
    if (isEditMode && !isWithinEditWindow(appointment.appointment_date)) {
      return {
        success: false,
        error: 'This visit can no longer be edited — edits are only allowed within 2 days of the appointment.',
      }
    }

    // Existing payment for this appointment (post-visit-created charges
    // always carry appointment_id — the New Charge dialog elsewhere never
    // sets it, so this lookup only ever finds the post-visit payment).
    const { data: existingPayment } = await supabase
      .from('payments')
      .select('id, approval_status, payment_status')
      .eq('appointment_id', appointmentId)
      .eq('clinic_id', clinicId)
      .maybeSingle()

    const chargesLocked = !isChargeEditable(existingPayment)

    let existingCharges: ChargeLineItem[] = []
    if (existingPayment) {
      const { data: lineItems } = await supabase
        .from('payment_line_items')
        .select('description, quantity, unit_price')
        .eq('payment_id', existingPayment.id)
        .eq('clinic_id', clinicId)
        .order('sort_order', { ascending: true })

      existingCharges = (lineItems ?? []).map((li: any) => ({
        localId:     crypto.randomUUID(),
        description: li.description,
        quantity:    li.quantity,
        unitPrice:   li.unit_price,
      }))
    }

    // ── Prescriptions ──────────────────────────────────────────────────────
    // Edit mode: pull from THIS encounter's prescriptions rows (the actual
    // saved visit record) — carePlanMedicineId is left undefined here since
    // we're not trying to re-derive the care-plan linkage, only what was
    // charted for this specific visit. Create mode (unchanged): pull from
    // the ongoing care_plan_medicines list, as before.
    let prescriptions: PrescriptionLine[] = []

    if (isEditMode) {
      const { data: encounterRx } = await supabase
        .from('prescriptions')
        .select('*')
        .eq('encounter_id', existingEncounter!.id)
        .eq('clinic_id', clinicId)
        .order('created_at', { ascending: true })

      prescriptions = (encounterRx ?? []).map((p: any): PrescriptionLine => ({
        localId:        crypto.randomUUID(),
        prescriptionId: p.id,
        medicineName:   p.medicine_name,
        drugId:         p.drug_id ?? undefined,
        dosage:         p.dosage ?? undefined,
        frequency:      p.frequency ?? undefined,
        duration:       p.duration ?? undefined,
        instructions:   p.instructions ?? undefined,
        status:         p.status,
        isDeleted:      false,
      }))
    } else {
      const { data: carePlan } = await supabase
        .from('care_plans')
        .select('id')
        .eq('patient_id', patientId)
        .eq('clinic_id', clinicId)
        .single()

      if (carePlan) {
        const { data: medicines } = await supabase
          .from('care_plan_medicines')
          .select('*')
          .eq('care_plan_id', carePlan.id)
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
              drugId:             undefined,
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
    }

    // ── Encounter data (diagnoses/observations) — edit mode only ──────────
    let encounterData: EncounterData | undefined
    if (isEditMode) {
      const [diagnosesRes, observationsRes] = await Promise.all([
        supabase
          .from('diagnoses')
          .select('*')
          .eq('encounter_id', existingEncounter!.id)
          .eq('clinic_id', clinicId)
          .order('created_at', { ascending: true }),
        supabase
          .from('observations')
          .select('*')
          .eq('encounter_id', existingEncounter!.id)
          .eq('clinic_id', clinicId)
          .order('created_at', { ascending: true }),
      ])

      const diagnoses: DiagnosisLine[] = (diagnosesRes.data ?? []).map((d: any) => ({
        localId:       crypto.randomUUID(),
        diagnosisId:   d.id,
        conditionName: d.condition_name,
        severity:      d.severity ?? undefined,
        status:        d.status,
        notes:         d.notes ?? undefined,
        isDeleted:     false,
      }))

      const observations: ObservationLine[] = (observationsRes.data ?? []).map((o: any) => ({
        localId:         crypto.randomUUID(),
        observationId:   o.id,
        observationType: o.observation_type,
        value:           o.value,
        unit:            o.unit ?? undefined,
        notes:           o.notes ?? undefined,
        isDeleted:       false,
      }))

      encounterData = {
        chiefComplaint: existingEncounter!.chief_complaint ?? undefined,
        notes:          existingEncounter!.notes ?? undefined,
        diagnoses,
        observations,
      }
    }

    // ── Reminders — not diffed/prefilled from existing schedule; the
    // original version of this file always started with an empty array
    // for reminderTimes (reminders don't have a clean "what's currently
    // scheduled for THIS visit" concept the way prescriptions do), and
    // that behavior is preserved for both create and edit mode. ──────────
    const reminderTimes: MedicineReminderTime[] = []

    const { data: settings } = await supabase
      .from('clinic_settings')
      .select('*')
      .eq('clinic_id', clinicId)
      .single()

    const settingsRow = settings as Record<string, unknown> | null
    const defaultFee: number | undefined =
      typeof settingsRow?.consultation_fee             === 'number'
        ? settingsRow.consultation_fee
        : typeof settingsRow?.default_consultation_fee === 'number'
          ? settingsRow.default_consultation_fee
          : undefined

    return {
      success: true,
      data: {
        patientId,
        prescriptions,
        reminderTimes,
        defaultFee,
        appointmentStatus: appointment.status,
        encounterId:        existingEncounter?.id,
        encounterData,
        existingCharges,
        chargesLocked,
        canEditClinical:        perms.canEditClinical,
        canEditCharges:         perms.canEditCharges && !chargesLocked,
        chargesRequireApproval: perms.chargesRequireApproval,
      },
    }
  } catch (err) {
    console.error('[getVisitPrefill]', err)
    return { success: false, error: 'Failed to load visit data. Please try again.' }
  }
}

// ─── completeVisit ────────────────────────────────────────────────────────────
//
// Handles BOTH first-time completion of a scheduled appointment AND
// re-editing an already-completed one — see the file header for the full
// design. Which mode applies is re-derived server-side (never trusted from
// the client): presence of an existing encounters row for this
// appointment_id means edit mode.

export async function completeVisit(
  payload: CompleteVisitPayload,
): Promise<CompleteVisitResult> {
  const profile = await getOrCreateProfile()
  if (!profile || !['doctor', 'staff'].includes(profile.role)) {
    return { success: false, error: 'Unauthorized.' }
  }

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
      .select('patient_id, doctor_id, status, appointment_date')
      .eq('id', data.appointmentId)
      .eq('clinic_id', clinicId)
      .is('deleted_at', null)
      .single()

    if (aptError || !appointment) {
      return { success: false, error: 'Appointment not found or not accessible.' }
    }
    if (appointment.status === 'cancelled') {
      return { success: false, error: 'Cancelled appointments cannot be completed or edited.' }
    }

    const perms = resolvePermissions(profile, appointment)
    if (!perms.canView) {
      return { success: false, error: 'You do not have access to this appointment.' }
    }

    // Reject the whole request if it touches clinical fields without
    // clinical permission — do NOT silently drop just those sections,
    // since that could look like a successful save that quietly ignored
    // what the caller actually asked to change. Charges-only submissions
    // from staff are the one path that's allowed through with reduced
    // permission (handled below, per-field).
    const touchesClinicalFields =
      data.prescriptions !== null || data.encounter !== null || data.reminderTimes !== null

    if (touchesClinicalFields && !perms.canEditClinical) {
      return {
        success: false,
        error: 'Only the treating doctor or an admin can edit prescriptions, care plan, or encounter details.',
      }
    }

    if (data.charges !== null && !perms.canEditCharges) {
      return { success: false, error: 'You do not have permission to set charges on this visit.' }
    }

    const patientId = data.patientId

    // Existing encounter for this appointment — presence = edit mode.
    const { data: existingEncounter } = await supabase
      .from('encounters')
      .select('id')
      .eq('appointment_id', data.appointmentId)
      .eq('clinic_id', clinicId)
      .maybeSingle()

    const isEditMode = !!existingEncounter

    // 2-day edit window (confirmed) — same rule as getVisitPrefill. Checked
    // again here independently since the client's prefill data could be
    // stale by the time save is actually submitted (e.g. a form left open
    // across the boundary).
    if (isEditMode && !isWithinEditWindow(appointment.appointment_date)) {
      return {
        success: false,
        error: 'This visit can no longer be edited — edits are only allowed within 2 days of the appointment.',
      }
    }

    // ════════════════════════════════════════════════════════════════════════
    // STEP A — Care-plan sync (unchanged from the original version — keyed
    // by carePlanMedicineId, independent of encounter edit mode, since the
    // care plan is the patient's ongoing medication list, not a per-visit
    // record).
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
    // STEP B — Medicine reminders (unchanged — always additive, never
    // diffed against existing reminders, same as the original version)
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
              medicine_name:    r.medicineName,
              reminder_time:    r.time,
              meal_association: r.mealAssociation ?? null,
              duration_days:    parseDurationDays(r.duration),
              reminder_text:    buildReminderText(r.medicineName, r.mealAssociation),
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
    //
    // CREATE mode (no existing encounter): identical to the original
    // version, except the new appointment_id column is now set on insert,
    // which is what makes edit mode possible on future saves.
    //
    // EDIT mode (existing encounter found): UPDATE the encounter row
    // (chief_complaint/notes/last_edited_by/last_edited_at) instead of
    // inserting a new one, and diff diagnoses/observations/prescriptions
    // against what's already saved — create/update/delete per line, same
    // pattern Step A already uses for care_plan_medicines.
    // ════════════════════════════════════════════════════════════════════════
    if (data.encounter !== null) {
      const enc = data.encounter

      if (isEditMode) {
        encounterId = existingEncounter!.id

        const { error: encUpdateError } = await supabase
          .from('encounters')
          .update({
            chief_complaint: enc.chiefComplaint ?? null,
            notes:           enc.notes          ?? null,
            last_edited_by:  profile.id,
            last_edited_at:  new Date().toISOString(),
            updated_at:      new Date().toISOString(),
          })
          .eq('id', encounterId)
          .eq('clinic_id', clinicId)

        if (encUpdateError) {
          console.error('[completeVisit] updateEncounter', encUpdateError)
          return {
            success: false,
            error:   'Failed to update the encounter record. No changes were saved. Please try again.',
          }
        }
      } else {
        const { data: encounter, error: encError } = await supabase
          .from('encounters')
          .insert({
            clinic_id:       clinicId,
            patient_id:      patientId,
            doctor_id:       appointment.doctor_id,
            appointment_id:  data.appointmentId,
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
      }

      // ── Diagnoses: diff (edit mode) or plain insert (create mode) ────────
      const deletedDx = enc.diagnoses.filter((d) => d.isDeleted && d.diagnosisId)
      const updatedDx = enc.diagnoses.filter((d) => !d.isDeleted && d.diagnosisId)
      const createdDx = enc.diagnoses.filter((d) => !d.isDeleted && !d.diagnosisId)

      for (const dx of deletedDx) {
        const { error } = await supabase
          .from('diagnoses')
          .delete()
          .eq('id', dx.diagnosisId!)
          .eq('clinic_id', clinicId)
        if (error) {
          console.error('[completeVisit] deleteDiagnosis', error)
          warnings.push(`Could not remove diagnosis "${dx.conditionName}".`)
        }
      }

      for (const dx of updatedDx) {
        const { error } = await supabase
          .from('diagnoses')
          .update({
            condition_name: dx.conditionName,
            severity:       dx.severity ?? null,
            status:         dx.status,
            notes:          dx.notes    ?? null,
            updated_at:     new Date().toISOString(),
          })
          .eq('id', dx.diagnosisId!)
          .eq('clinic_id', clinicId)
        if (error) {
          console.error('[completeVisit] updateDiagnosis', error)
          warnings.push(`Could not update diagnosis "${dx.conditionName}".`)
        }
      }

      if (createdDx.length > 0) {
        const { error } = await supabase.from('diagnoses').insert(
          createdDx.map((d) => ({
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

      // ── Observations: diff (edit mode) or plain insert (create mode) ────
      const deletedObs = enc.observations.filter((o) => o.isDeleted && o.observationId)
      const updatedObs = enc.observations.filter((o) => !o.isDeleted && o.observationId)
      const createdObs = enc.observations.filter((o) => !o.isDeleted && !o.observationId)

      for (const obs of deletedObs) {
        const { error } = await supabase
          .from('observations')
          .delete()
          .eq('id', obs.observationId!)
          .eq('clinic_id', clinicId)
        if (error) {
          console.error('[completeVisit] deleteObservation', error)
          warnings.push(`Could not remove observation "${obs.observationType}".`)
        }
      }

      for (const obs of updatedObs) {
        const { error } = await supabase
          .from('observations')
          .update({
            observation_type: obs.observationType,
            value:             obs.value,
            unit:              obs.unit  ?? null,
            notes:             obs.notes ?? null,
            updated_at:        new Date().toISOString(),
          })
          .eq('id', obs.observationId!)
          .eq('clinic_id', clinicId)
        if (error) {
          console.error('[completeVisit] updateObservation', error)
          warnings.push(`Could not update observation "${obs.observationType}".`)
        }
      }

      if (createdObs.length > 0) {
        const { error } = await supabase.from('observations').insert(
          createdObs.map((o) => ({
            clinic_id:        clinicId,
            encounter_id:     encounterId,
            patient_id:       patientId,
            observation_type: o.observationType,
            value:             o.value,
            unit:              o.unit  ?? null,
            notes:             o.notes ?? null,
          })),
        )
        if (error) {
          console.error('[completeVisit] observations', error)
          warnings.push('Some vitals / observations could not be saved.')
        }
      }

      // ── Encounter-level prescriptions: diff (edit mode) or plain insert
      // (create mode) — keyed by prescriptionId (the encounter-level
      // prescriptions.id), NOT carePlanMedicineId, which Step A already
      // handled separately for the ongoing care plan. ─────────────────────
      const activePrescriptions = (data.prescriptions ?? []).filter((p) => !p.isDeleted)
      const deletedRx = (data.prescriptions ?? []).filter((p) => p.isDeleted && p.prescriptionId)
      const updatedRx = activePrescriptions.filter((p) => p.prescriptionId)
      const createdRx = activePrescriptions.filter((p) => !p.prescriptionId)

      for (const rx of deletedRx) {
        const { error } = await supabase
          .from('prescriptions')
          .delete()
          .eq('id', rx.prescriptionId!)
          .eq('clinic_id', clinicId)
        if (error) {
          console.error('[completeVisit] deleteEncounterPrescription', error)
          warnings.push(`Could not remove "${rx.medicineName}" from the encounter record.`)
        }
      }

      for (const rx of updatedRx) {
        const { error } = await supabase
          .from('prescriptions')
          .update({
            medicine_name: rx.medicineName,
            drug_id:       rx.drugId ?? null,
            dosage:        rx.dosage       ?? null,
            frequency:     rx.frequency    ?? null,
            duration:      rx.duration     ?? null,
            instructions:  rx.instructions ?? null,
            status:        rx.status,
            updated_at:    new Date().toISOString(),
          })
          .eq('id', rx.prescriptionId!)
          .eq('clinic_id', clinicId)
        if (error) {
          console.error('[completeVisit] updateEncounterPrescription', error)
          warnings.push(`Could not update "${rx.medicineName}" in the encounter record.`)
        }
      }

      if (createdRx.length > 0) {
        const { error } = await supabase.from('prescriptions').insert(
          createdRx.map((p) => ({
            clinic_id:     clinicId,
            encounter_id:  encounterId,
            patient_id:    patientId,
            medicine_name: p.medicineName,
            drug_id:       p.drugId ?? null,
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
    //
    // Financial-integrity rule: if a payment already exists for this
    // appointment and is NOT editable (money has been collected), charge
    // changes are silently skipped — NOT an error for the whole save — with
    // a warning surfaced instead, so clinical edits above still go through.
    //
    // Attribution is always the TREATING doctor (appointment.doctor_id),
    // regardless of who is submitting — a staff member editing charges on
    // a doctor's visit does not change whose charge it is.
    //
    // Approval: doctor/admin submissions are auto-approved (as before).
    // Staff submissions are always 'pending', reusing the existing charge-
    // approval queue — same as any other staff-created charge in the app
    // (Option A, confirmed).
    // ════════════════════════════════════════════════════════════════════════
    if (data.charges !== null) {
      const { data: existingPayment } = await supabase
        .from('payments')
        .select('id, approval_status, payment_status')
        .eq('appointment_id', data.appointmentId)
        .eq('clinic_id', clinicId)
        .maybeSingle()

      if (existingPayment && !isChargeEditable(existingPayment)) {
        warnings.push(
          'Charges were not changed — payment has already been collected on this visit. ' +
          'Use the Payments screen to record any correction as a separate transaction.',
        )
      } else {
        const totalAmount = data.charges.reduce(
          (sum, item) => sum + item.quantity * item.unitPrice,
          0,
        )
        const description = descriptionFromLines(data.charges)
        const approvalStatus: 'approved' | 'pending' = perms.chargesRequireApproval ? 'pending' : 'approved'

        if (existingPayment) {
          // Update existing payment (still pending, or approved-but-unpaid).
          const updatePayload: Record<string, unknown> = {
            description,
            amount_charged:  totalAmount,
            approval_status: approvalStatus,
            updated_at:      new Date().toISOString(),
          }

          if (approvalStatus === 'approved') {
            updatePayload.approved_by = profile.id
            updatePayload.approved_at = new Date().toISOString()
          } else {
            // Reverting to pending (a staff edit on a previously-approved-
            // but-still-unpaid charge) clears approval metadata so it shows
            // correctly in the approvals queue again.
            updatePayload.approved_by = null
            updatePayload.approved_at = null
          }

          const { error: payUpdateError } = await supabase
            .from('payments')
            .update(updatePayload)
            .eq('id', existingPayment.id)
            .eq('clinic_id', clinicId)

          if (payUpdateError) {
            console.error('[completeVisit] updatePayment', payUpdateError)
            warnings.push('Charges could not be updated. You can edit them from the Payments screen.')
          } else {
            paymentId = existingPayment.id

            const { error: deleteLineItemsError } = await supabase
              .from('payment_line_items')
              .delete()
              .eq('payment_id', paymentId)
              .eq('clinic_id', clinicId)

            if (deleteLineItemsError) {
              console.error('[completeVisit] deleteLineItems', deleteLineItemsError)
              warnings.push('Could not clear previous charge line items.')
            }

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
              warnings.push('Payment was updated but line item details could not be saved.')
            }
          }
        } else if (data.charges.length > 0) {
          // No existing payment — create one, same as the original version.
          let receiptNumber: string | null = null

          if (approvalStatus === 'approved') {
            const { data: newReceiptNumber, error: receiptError } = await supabase.rpc(
              'next_receipt_number',
              { p_clinic_id: clinicId },
            )
            if (receiptError || !newReceiptNumber) {
              console.error('[completeVisit] receiptNumber', receiptError)
              warnings.push(
                'Could not generate a receipt number; charges were not saved. ' +
                'You can add charges manually from the Payments screen.',
              )
            } else {
              receiptNumber = newReceiptNumber
            }
          }

          // For a pending (staff-proposed) charge, no receipt number yet —
          // matches setAmountAndApprovePayment's behavior elsewhere, which
          // also only assigns one at approval time.
          if (approvalStatus === 'pending' || receiptNumber) {
            const { data: payment, error: payError } = await supabase
              .from('payments')
              .insert({
                clinic_id:       clinicId,
                patient_id:      patientId,
                appointment_id:  data.appointmentId,
                doctor_id:       appointment.doctor_id,
                description,
                amount_charged:  totalAmount,
                amount_paid:     0,
                approval_status: approvalStatus,
                approved_by:     approvalStatus === 'approved' ? profile.id : null,
                approved_at:     approvalStatus === 'approved' ? new Date().toISOString() : null,
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

              // Receipt document + WhatsApp message: only for an
              // auto-approved charge with no collection needed to trigger
              // it separately — but per the Issue 5 receipt-timing change,
              // documents now only generate on first COLLECTION, not on
              // approval. Nothing to do here anymore; kept for reference:
              // generateAndStorePaymentDocuments/createReceiptMessage are
              // now called from recordPaymentCollection instead.
            }
          }
        }
        // else: no existing payment AND data.charges is empty — nothing to do.
      }
    }

    // ════════════════════════════════════════════════════════════════════════
    // STEP E — Mark appointment complete (create mode only — an edit on an
    // already-completed appointment doesn't need to re-transition status)
    // ════════════════════════════════════════════════════════════════════════
    if (!isEditMode) {
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
    }

    revalidatePath('/dashboard/appointments')
    revalidatePath(`/dashboard/patients/${patientId}`)
    revalidatePath('/dashboard/payments')
    revalidatePath('/dashboard/payments/approvals')

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