// src/features/patients/actions.ts
"use server"
import { after } from "next/server"
import { requireRole } from "@/lib/supabase/profile"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { patientFormSchema } from "./schema"
import type { PatientFormData } from "./schema"
import { calculateAge } from "./types"
import type { PatientListItem, PatientRecord } from "./types"
import { createRegistrationMessage } from "@/features/messaging/actions"
import { grantConsent } from "@/features/consent/actions"

type Result<T> =
  | { success: true; data: T }
  | { success: false; error: string }

function toDbRow(data: PatientFormData, clinicId: string) {
  return {
    clinic_id:                      clinicId,
    first_name:                     data.firstName,
    last_name:                      data.lastName,
    date_of_birth:                  data.dateOfBirth,
    gender:                         data.gender,
    blood_group:                    data.bloodGroup,
    status:                         data.status,
    phone:                          data.phone,
    email:                          data.email,
    address:                        data.addressLine,
    city:                           data.city,
    state:                          data.state,
    postal_code:                    data.pincode,
    language_preference:            data.languagePreference,
    emergency_contact_name:         data.emergencyName,
    emergency_contact_phone:        data.emergencyPhone,
    emergency_contact_relationship: data.emergencyRelationship,
    allergies:                      data.allergies,
    conditions:                     data.conditions,
    notes:                          data.notes,
  }
}

function toListItem(row: PatientRecord): PatientListItem {
  return {
    id:        row.id,
    mrn:       row.patient_id_number ?? "—",
    firstName: row.first_name,
    lastName:  row.last_name,
    age:       calculateAge(row.date_of_birth),
    gender:    row.gender,
    phone:     row.phone,
    status:    row.status,
  }
}

export async function listPatients(): Promise<Result<PatientListItem[]>> {
  const profile = await requireRole("doctor", "staff")

  try {
    const supabase = createServerSupabaseClient()

    const { data, error } = await supabase
      .from("patients")
      .select(
        "id, patient_id_number, first_name, last_name, date_of_birth, gender, phone, status",
      )
      .eq("clinic_id", profile.clinic_id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })

    if (error) throw error

    const rows = (data ?? []) as PatientRecord[]
    return { success: true, data: rows.map(toListItem) }
  } catch (err) {
    console.error("[listPatients]", err)
    return { success: false, error: "Failed to load patients." }
  }
}

export async function getPatient(id: string): Promise<Result<PatientRecord>> {
  const profile = await requireRole("doctor", "staff")

  try {
    const supabase = createServerSupabaseClient()

    const { data, error } = await supabase
      .from("patients")
      .select("*")
      .eq("id", id)
      .eq("clinic_id", profile.clinic_id)
      .is("deleted_at", null)
      .single()

    if (error) throw error
    if (!data) return { success: false, error: "Patient not found." }

    return { success: true, data: data as PatientRecord }
  } catch (err) {
    console.error("[getPatient]", err)
    return { success: false, error: "Failed to load patient." }
  }
}

export async function createPatient(raw: unknown): Promise<Result<PatientRecord>> {
  const profile = await requireRole("doctor", "staff")

  try {
    const parsed = patientFormSchema.safeParse(raw)
    if (!parsed.success) {
      const message =
        parsed.error.issues[0]?.message ?? "Please check the form and try again."
      return { success: false, error: message }
    }

    // DPDP Act 2023 Section 6: data processing requires informed consent
    // captured at collection. patient-form.tsx requires this checkbox in
    // create mode and disables submit until it's checked, but that's a
    // UX guard only — the server independently re-verifies rather than
    // trusting the client, same principle as every other check in this
    // file.
    if (!parsed.data.consentGiven) {
      return {
        success: false,
        error: "Please confirm the patient has consented before registering.",
      }
    }

    // clinic_id is genuinely nullable on Profile now (patients have none
    // by design), but requireRole("doctor", "staff") means role is never
    // 'patient' here, so a real clinic_id should always be present. This
    // check fails clearly instead of silently writing clinic_id: null
    // into a new patient row if that invariant is ever violated.
    if (!profile.clinic_id) {
      return { success: false, error: "Your account is not associated with a clinic." }
    }

    // A doctor registering a patient can only ever assign that patient to
    // themselves — the client's value is ignored entirely for that role,
    // so there's no way to tamper with the request to assign someone else.
    // Staff must explicitly choose a doctor.
    let assignedDoctorId: string | null
    if (profile.role === "doctor") {
      assignedDoctorId = profile.id
    } else {
      assignedDoctorId = parsed.data.assignedDoctorId
      if (!assignedDoctorId) {
        return { success: false, error: "Please assign a doctor for this patient." }
      }
    }

    const supabase = createServerSupabaseClient()
    const row = {
      ...toDbRow(parsed.data, profile.clinic_id),
      assigned_doctor_id: assignedDoctorId,
    }

    const { data, error } = await supabase
      .from("patients")
      .insert(row)
      .select("*")
      .single()

    if (error) throw error

    // Grant baseline consent — 5 purposes bundled at intake.
    // Patient can revoke any of these independently later via the portal.
    //
    // Consent is granted FIRST and awaited before createRegistrationMessage
    // runs, so the registration message's own hasActiveConsent check (in
    // messaging/actions.ts) always finds a row to check against rather than
    // racing an empty patient_consents table.
    //
    // The sixth purpose (record_sharing) is deferred to Phase 2 and not
    // granted here — it's opt-in only, reserved for future cross-clinic
    // features that don't exist yet.
    const patientId = (data as PatientRecord).id
    after(async () => {
      try {
        // Five purposes, all auto-granted at registration
        const purposes = [
          'data_processing',
          'whatsapp_notifications',
          'appointment_reminders',
          'medication_reminders',
          'care_plan_access',
        ] as const

        for (const purpose of purposes) {
          const result = await grantConsent({
            patient_id: patientId,
            purpose,
          })
          if (!result.success) {
            console.error(
              `[createPatient] Failed to grant ${purpose} consent:`,
              result.error,
            )
          }
        }
      } catch (err) {
        console.error('[createPatient] Consent grant failed:', err)
      }

      try {
        await createRegistrationMessage({ patientId })
      } catch (err) {
        console.error('[createPatient] Registration message failed:', err)
      }
    })

    return { success: true, data: data as PatientRecord }
  } catch (err) {
    console.error("[createPatient]", err)
    return { success: false, error: "Failed to register patient." }
  }
}

export async function updatePatient(
  id:  string,
  raw: unknown,
): Promise<Result<PatientRecord>> {
  const profile = await requireRole("doctor", "staff")

  try {
    const parsed = patientFormSchema.safeParse(raw)
    if (!parsed.success) {
      const message =
        parsed.error.issues[0]?.message ?? "Please check the form and try again."
      return { success: false, error: message }
    }

    if (!profile.clinic_id) {
      return { success: false, error: "Your account is not associated with a clinic." }
    }

    if (profile.role === "staff" && !parsed.data.assignedDoctorId) {
      return { success: false, error: "Please assign a doctor for this patient." }
    }

    const supabase = createServerSupabaseClient()

    const { clinic_id: _clinicId, ...baseUpdateRow } = toDbRow(
      parsed.data,
      profile.clinic_id,
    )

    // Only staff can change who a patient is assigned to. A doctor editing
    // a patient — who may not even be their own, since every doctor can
    // currently see and edit every clinic patient — must never silently
    // reassign them, so the field is simply left out of the update when
    // the caller is a doctor.
    const updateRow =
      profile.role === "staff"
        ? { ...baseUpdateRow, assigned_doctor_id: parsed.data.assignedDoctorId }
        : baseUpdateRow

    const { data, error } = await supabase
      .from("patients")
      .update(updateRow)
      .eq("id", id)
      .eq("clinic_id", profile.clinic_id)
      .is("deleted_at", null)
      .select("*")
      .single()

    if (error) throw error
    if (!data) return { success: false, error: "Patient not found." }

    return { success: true, data: data as PatientRecord }
  } catch (err) {
    console.error("[updatePatient]", err)
    return { success: false, error: "Failed to update patient." }
  }
}

export async function archivePatient(
  id: string,
): Promise<Result<{ id: string }>> {
  const profile = await requireRole("doctor", "staff")

  try {
    const supabase = createServerSupabaseClient()

    const { data, error } = await supabase
      .from("patients")
      .update({ status: "archived" })
      .eq("id", id)
      .eq("clinic_id", profile.clinic_id)
      .is("deleted_at", null)
      .select("id")
      .single()

    if (error) throw error
    if (!data) return { success: false, error: "Patient not found." }

    return { success: true, data: { id } }
  } catch (err) {
    console.error("[archivePatient]", err)
    return { success: false, error: "Failed to archive patient." }
  }
}