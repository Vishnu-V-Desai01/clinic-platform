// src/features/patients/actions.ts
//
// All patient CRUD lives here. Every function:
//   1. Authorises the caller via requireRole (app-level guard)
//   2. Validates input with Zod (server-level guard)
//   3. Queries Supabase (database-level guard via RLS)
//
// The clinic_id always comes from the authenticated profile — never from
// the form — so a caller can never write into a different clinic.

"use server"

import { requireRole } from "@/lib/supabase/profile"
import { createServerSupabaseClient } from "@/lib/supabase/server"

import { patientFormSchema } from "./schema"
import type { PatientFormData } from "./schema"             // FIXED: was "./types"
import { calculateAge } from "./types"
import type { PatientListItem, PatientRecord } from "./types"

/* -------------------------------------------------------------------------- */
/*  Result envelope                                                            */
/*  Every action returns one of these — callers always know what to expect.   */
/* -------------------------------------------------------------------------- */

type Result<T> =
  | { success: true; data: T }
  | { success: false; error: string }

/* -------------------------------------------------------------------------- */
/*  toDbRow                                                                    */
/*  Maps cleaned Zod output (camelCase) → exact DB column names (snake_case). */
/*  clinic_id always comes from the authenticated profile, never from the form.*/
/* -------------------------------------------------------------------------- */

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
    emergency_contact_name:         data.emergencyName,
    emergency_contact_phone:        data.emergencyPhone,
    emergency_contact_relationship: data.emergencyRelationship,
    allergies:                      data.allergies,
    conditions:                     data.conditions,
    notes:                          data.notes,
  }
}

/* -------------------------------------------------------------------------- */
/*  toListItem                                                                 */
/*  Shrinks a full DB row to the compact shape the patients table displays.    */
/* -------------------------------------------------------------------------- */

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

/* -------------------------------------------------------------------------- */
/*  listPatients                                                               */
/*  Returns all non-deleted patients for the clinic, newest first.            */
/*  Only the columns the list table needs are fetched — keeps payload small.  */
/* -------------------------------------------------------------------------- */

export async function listPatients(): Promise<Result<PatientListItem[]>> {
  try {
    const profile  = await requireRole("doctor", "staff")   // FIXED: rest params
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

/* -------------------------------------------------------------------------- */
/*  getPatient                                                                 */
/*  Returns one patient's full record.                                        */
/*  The double .eq() — id AND clinic_id — means staff from another clinic     */
/*  can never read this record even if they somehow know the UUID.            */
/* -------------------------------------------------------------------------- */

export async function getPatient(id: string): Promise<Result<PatientRecord>> {
  try {
    const profile  = await requireRole("doctor", "staff")   // FIXED: rest params
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

/* -------------------------------------------------------------------------- */
/*  createPatient                                                              */
/*  1. Authorises caller.                                                     */
/*  2. Validates form data with Zod — returns the first friendly error on     */
/*     failure so the UI can show it.                                         */
/*  3. Inserts and returns the newly created row.                             */
/*  NOTE: patient_id_number (MRN) is NOT in the insert payload — the         */
/*  database DEFAULT generates it automatically from the sequence we set up. */
/* -------------------------------------------------------------------------- */

export async function createPatient(raw: unknown): Promise<Result<PatientRecord>> {
  try {
    const profile = await requireRole("doctor", "staff")    // FIXED: rest params

    const parsed = patientFormSchema.safeParse(raw)
    if (!parsed.success) {
      const message =
        parsed.error.issues[0]?.message ?? "Please check the form and try again." // FIXED: .issues
      return { success: false, error: message }
    }

    const supabase = createServerSupabaseClient()
    const row      = toDbRow(parsed.data, profile.clinic_id)

    const { data, error } = await supabase
      .from("patients")
      .insert(row)
      .select("*")
      .single()

    if (error) throw error

    return { success: true, data: data as PatientRecord }
  } catch (err) {
    console.error("[createPatient]", err)
    return { success: false, error: "Failed to register patient." }
  }
}

/* -------------------------------------------------------------------------- */
/*  updatePatient                                                              */
/*  Same validation flow as create.                                           */
/*  clinic_id and patient_id_number are stripped from the update payload —   */
/*  those two columns must never change after a patient is registered.        */
/* -------------------------------------------------------------------------- */

export async function updatePatient(
  id:  string,
  raw: unknown,
): Promise<Result<PatientRecord>> {
  try {
    const profile = await requireRole("doctor", "staff")    // FIXED: rest params

    const parsed = patientFormSchema.safeParse(raw)
    if (!parsed.success) {
      const message =
        parsed.error.issues[0]?.message ?? "Please check the form and try again." // FIXED: .issues
      return { success: false, error: message }
    }

    const supabase = createServerSupabaseClient()

    // Build the update object, then remove clinic_id — it must never change.
    const { clinic_id: _clinicId, ...updateRow } = toDbRow(
      parsed.data,
      profile.clinic_id,
    )

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

/* -------------------------------------------------------------------------- */
/*  archivePatient                                                             */
/*  Sets status → "archived". NOT a hard delete.                              */
/*  The record stays in the database; it's just filtered from the default     */
/*  list view. Doctors/staff can still find archived patients with the filter. */
/* -------------------------------------------------------------------------- */

export async function archivePatient(
  id: string,
): Promise<Result<{ id: string }>> {
  try {
    const profile  = await requireRole("doctor", "staff")   // FIXED: rest params
    const supabase = createServerSupabaseClient()

    const { error } = await supabase
      .from("patients")
      .update({ status: "archived" })
      .eq("id", id)
      .eq("clinic_id", profile.clinic_id)
      .is("deleted_at", null)

    if (error) throw error

    return { success: true, data: { id } }
  } catch (err) {
    console.error("[archivePatient]", err)
    return { success: false, error: "Failed to archive patient." }
  }
}