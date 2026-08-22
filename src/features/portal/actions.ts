'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/supabase/profile'
import type {
  PortalCardDetail,
  PortalEncounter,
  PortalCarePlan,
  PortalStatus,
} from './types'

type ActionResult<T = null> =
  | { success: true; data: T }
  | { success: false; error: string }

// ─── Internal row shapes for Supabase nested selects ─────────────────────────

type EncounterRow = {
  id: string
  encounter_date: string
  chief_complaint: string | null
  notes: string | null
  status: string
  diagnoses: {
    id: string
    condition_name: string
    severity: string | null
    status: string
    notes: string | null
    created_at: string
  }[]
  observations: {
    id: string
    observation_type: string
    value: string
    unit: string | null
    notes: string | null
    created_at: string
  }[]
  prescriptions: {
    id: string
    medicine_name: string
    dosage: string | null
    frequency: string | null
    duration: string | null
    instructions: string | null
    status: string
    created_at: string
  }[]
  test_results: {
    id: string
    test_name: string
    result_value: string | null
    result_text: string | null
    reference_range: string | null
    is_abnormal: boolean
    status: string
    notes: string | null
    created_at: string
  }[]
}

type CarePlanRow = {
  id: string
  notes: string | null
  updated_at: string
  care_plan_medicines: {
    id: string
    medicine_name: string
    strength: string | null
    unit: string | null
    frequency: string
    duration_value: number | null
    duration_unit: string | null
    instructions: string | null
  }[]
  care_plan_follow_ups: {
    id: string
    description: string
    scheduled_date: string | null
    priority: string | null
    status: string
  }[]
  care_plan_suggestions: {
    id: string
    suggestion_text: string
    category: string | null
  }[]
}

type CardRow = {
  id: string
  first_name: string
  last_name: string
  clinic_name: string
  created_at: string
}

// appointments has no `notes` column — the actual column is
// `doctor_notes`. Mapped to the external `notes` field in the
// return object so PortalAppointment's shape stays unchanged.
type ApptRow = {
  id: string
  appointment_date: string
  status: string
  doctor_notes: string | null
  cancellation_reason: string | null
  created_at: string
}

type PaymentRow = {
  id: string
  amount_charged: number
  amount_paid: number
  outstanding_balance: number
  payment_status: string
  approval_status: string
  created_at: string
}

// Column list matches toDbRow() in features/patients/actions.ts exactly —
// that function is the write path for this table, so it's the
// authoritative source for which columns exist.
type PatientRow = {
  id: string
  first_name: string
  last_name: string
  patient_id_number: string | null
  date_of_birth: string | null
  gender: string | null
  blood_group: string | null
  status: string
  phone: string | null
  email: string | null
  address: string | null
  city: string | null
  state: string | null
  postal_code: string | null
  language_preference: string | null
  emergency_contact_name: string | null
  emergency_contact_phone: string | null
  emergency_contact_relationship: string | null
  allergies: string[]
  conditions: string[]
  notes: string | null
}

type PortalStatusRow = {
  curakin_patient_code: string
  portal_onboarded_at: string | null
}

// ─── Portal status ────────────────────────────────────────────────────────────

export async function getMyPortalStatus(): Promise<ActionResult<PortalStatus>> {
  await requireRole('patient')
  const supabase = createServerSupabaseClient()

  const { data, error } = await supabase.rpc('get_my_portal_status')

  if (error) return { success: false, error: error.message }

  const rows = data as PortalStatusRow[] | null
  const row = rows?.[0]
  if (!row) return { success: false, error: 'Family account not found' }

  return {
    success: true,
    data: {
      familyCode: row.curakin_patient_code,
      isOnboarded: row.portal_onboarded_at !== null,
    },
  }
}

// Returns the patient's display name for greeting purposes only.
// This exists so client components never import @/lib/supabase/profile
// directly — that module pulls in server-only Clerk/Supabase code
// which breaks the build if bundled into client JS. This 'use server'
// file is the safe bridge: the client receives only an RPC stub.
export async function getMyDisplayName(): Promise<ActionResult<{ fullName: string | null }>> {
  const profile = await requireRole('patient')
  return { success: true, data: { fullName: profile.full_name } }
}

// ─── Onboarding: grant all initial consents ───────────────────────────────────

async function grantInitialConsentsForAllCards(): Promise<ActionResult<null>> {
  const supabase = createServerSupabaseClient()
  const profile = await requireRole('patient')

  const { data: cardsRaw, error: cardsErr } = await supabase.rpc('list_my_family_patient_cards')
  if (cardsErr) return { success: false, error: cardsErr.message }

  type CardData = {
    id: string
    clinic_name: string
  }
  const cards = (cardsRaw ?? []) as CardData[]

  const { data: patientsRaw, error: pErr } = await supabase
    .from('patients')
    .select('id, clinic_id')
    .in(
      'id',
      cards.map((c) => c.id),
    )
    .is('deleted_at', null)

  if (pErr) return { success: false, error: pErr.message }

  type PatientLinkData = { id: string; clinic_id: string }
  const patients = (patientsRaw ?? []) as PatientLinkData[]

  if (patients.length === 0) {
    return { success: true, data: null }
  }

  const now = new Date().toISOString()
  const purposes = [
    'data_processing',
    'appointment_reminders',
    'medication_reminders',
    'whatsapp_notifications',
    'care_plan_access',
    'record_sharing',
  ]

  for (const patient of patients) {
    for (const purpose of purposes) {
      const { error } = await supabase.from('patient_consents').upsert(
        {
          clinic_id: patient.clinic_id,
          patient_id: patient.id,
          purpose,
          is_active: true,
          granted_by: profile.id,
          granted_at: now,
          revoked_by: null,
          revoked_at: null,
          notes: 'Auto-granted during patient portal onboarding',
          updated_at: now,
        },
        { onConflict: 'patient_id,purpose' },
      )

      if (error) return { success: false, error: error.message }
    }
  }

  return { success: true, data: null }
}

export async function completePortalOnboarding(): Promise<ActionResult<null>> {
  await requireRole('patient')
  const supabase = createServerSupabaseClient()

  const { error: flagError } = await supabase.rpc('complete_portal_onboarding')
  if (flagError) return { success: false, error: flagError.message }

  const consentResult = await grantInitialConsentsForAllCards()
  if (!consentResult.success) return consentResult

  revalidatePath('/portal')
  return { success: true, data: null }
}

// ─── Card detail ──────────────────────────────────────────────────────────────

export async function getPatientCardDetail(
  patientId: string,
): Promise<ActionResult<PortalCardDetail>> {
  await requireRole('patient')
  const supabase = createServerSupabaseClient()

  const [
    { data: patient, error: patientError },
    { data: appts, error: apptsError },
    { data: encountersRaw, error: encError },
    { data: payments, error: paymentsError },
    { data: carePlanRaw, error: cpError },
    { data: cardsRaw, error: cardsError },
  ] = await Promise.all([
    supabase
      .from('patients')
      .select(
        'id, first_name, last_name, patient_id_number, date_of_birth, gender, blood_group, status, phone, email, address, city, state, postal_code, language_preference, emergency_contact_name, emergency_contact_phone, emergency_contact_relationship, allergies, conditions, notes',
      )
      .eq('id', patientId)
      .is('deleted_at', null)
      .maybeSingle(),

    supabase
      .from('appointments')
      .select('id, appointment_date, status, doctor_notes, cancellation_reason, created_at')
      .eq('patient_id', patientId)
      .is('deleted_at', null)
      .order('appointment_date', { ascending: false }),

    supabase
      .from('encounters')
      .select(`
        id, encounter_date, chief_complaint, notes, status,
        diagnoses(id, condition_name, severity, status, notes, created_at),
        observations(id, observation_type, value, unit, notes, created_at),
        prescriptions(id, medicine_name, dosage, frequency, duration, instructions, status, created_at),
        test_results(id, test_name, result_value, result_text, reference_range, is_abnormal, status, notes, created_at)
      `)
      .eq('patient_id', patientId)
      .order('encounter_date', { ascending: false }),

    supabase
      .from('payments')
      .select(
        'id, amount_charged, amount_paid, outstanding_balance, payment_status, approval_status, created_at',
      )
      .eq('patient_id', patientId)
      .order('created_at', { ascending: false }),

    supabase
      .from('care_plans')
      .select(`
        id, notes, updated_at,
        care_plan_medicines(id, medicine_name, strength, unit, frequency, duration_value, duration_unit, instructions),
        care_plan_follow_ups(id, description, scheduled_date, priority, status),
        care_plan_suggestions(id, suggestion_text, category)
      `)
      .eq('patient_id', patientId)
      .maybeSingle(),

    supabase.rpc('list_my_family_patient_cards'),
  ])

  const firstError =
    patientError ?? apptsError ?? encError ?? paymentsError ?? cpError ?? cardsError
  if (firstError) return { success: false, error: firstError.message }

  if (!patient) return { success: false, error: 'Patient card not found' }

  const cards = (cardsRaw ?? []) as CardRow[]
  const matchingCard = cards.find((c) => c.id === patientId)
  const clinicName = matchingCard?.clinic_name ?? 'Unknown Clinic'

  const encounters = encountersRaw as EncounterRow[] | null
  const portalEncounters: PortalEncounter[] = (encounters ?? []).map((e) => ({
    id: e.id,
    encounterDate: e.encounter_date,
    chiefComplaint: e.chief_complaint,
    notes: e.notes,
    status: e.status,
    diagnoses: (e.diagnoses ?? []).map((d) => ({
      id: d.id,
      conditionName: d.condition_name,
      severity: d.severity,
      status: d.status,
      notes: d.notes,
      createdAt: d.created_at,
    })),
    observations: (e.observations ?? []).map((o) => ({
      id: o.id,
      observationType: o.observation_type,
      value: o.value,
      unit: o.unit,
      notes: o.notes,
      createdAt: o.created_at,
    })),
    prescriptions: (e.prescriptions ?? []).map((p) => ({
      id: p.id,
      medicineName: p.medicine_name,
      dosage: p.dosage,
      frequency: p.frequency,
      duration: p.duration,
      instructions: p.instructions,
      status: p.status,
      createdAt: p.created_at,
    })),
    testResults: (e.test_results ?? []).map((t) => ({
      id: t.id,
      testName: t.test_name,
      resultValue: t.result_value,
      resultText: t.result_text,
      referenceRange: t.reference_range,
      isAbnormal: t.is_abnormal,
      status: t.status,
      notes: t.notes,
      createdAt: t.created_at,
    })),
  }))

  const cp = carePlanRaw as CarePlanRow | null
  const portalCarePlan: PortalCarePlan | null = cp
    ? {
        id: cp.id,
        notes: cp.notes,
        updatedAt: cp.updated_at,
        medicines: (cp.care_plan_medicines ?? []).map((m) => ({
          id: m.id,
          medicineName: m.medicine_name,
          strength: m.strength,
          unit: m.unit,
          frequency: m.frequency,
          durationValue: m.duration_value,
          durationUnit: m.duration_unit,
          instructions: m.instructions,
        })),
        followUps: (cp.care_plan_follow_ups ?? []).map((f) => ({
          id: f.id,
          description: f.description,
          scheduledDate: f.scheduled_date,
          priority: f.priority,
          status: f.status,
        })),
        suggestions: (cp.care_plan_suggestions ?? []).map((s) => ({
          id: s.id,
          suggestionText: s.suggestion_text,
          category: s.category,
        })),
      }
    : null

  const p = patient as PatientRow

  return {
    success: true,
    data: {
      patientId: p.id,
      firstName: p.first_name,
      lastName: p.last_name,
      clinicName,
      mrn: p.patient_id_number,
      dateOfBirth: p.date_of_birth,
      gender: p.gender,
      bloodGroup: p.blood_group,
      status: p.status,
      phone: p.phone,
      email: p.email,
      address: p.address,
      city: p.city,
      state: p.state,
      postalCode: p.postal_code,
      languagePreference: p.language_preference,
      emergencyContactName: p.emergency_contact_name,
      emergencyContactPhone: p.emergency_contact_phone,
      emergencyContactRelationship: p.emergency_contact_relationship,
      allergies: p.allergies ?? [],
      conditions: p.conditions ?? [],
      notes: p.notes,
      encounters: portalEncounters,
      appointments: (appts as ApptRow[] | null ?? []).map((a) => ({
        id: a.id,
        appointmentDate: a.appointment_date,
        status: a.status,
        notes: a.doctor_notes,
        cancellationReason: a.cancellation_reason,
        createdAt: a.created_at,
      })),
      payments: (payments as PaymentRow[] | null ?? []).map((pay) => ({
        id: pay.id,
        amountCharged: pay.amount_charged,
        amountPaid: pay.amount_paid,
        outstandingBalance: pay.outstanding_balance,
        paymentStatus: pay.payment_status,
        approvalStatus: pay.approval_status,
        createdAt: pay.created_at,
      })),
      carePlan: portalCarePlan,
    },
  }
}