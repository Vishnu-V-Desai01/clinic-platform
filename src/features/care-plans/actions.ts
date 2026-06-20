// src/features/care-plans/actions.ts

'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getOrCreateProfile, requireRole } from '@/lib/supabase/profile';
import {
  carePlanFormSchema,
  carePlanMedicineFormSchema,
  carePlanFollowUpFormSchema,
  carePlanSuggestionFormSchema,
  carePlanReminderFormSchema,
  type CarePlanFormData,
  type CarePlanMedicineFormData,
  type CarePlanFollowUpFormData,
  type CarePlanSuggestionFormData,
  type CarePlanReminderFormData,
} from './schema';
import {
  type CarePlan,
  type CarePlanMedicine,
  type CarePlanFollowUp,
  type CarePlanSuggestion,
  type CarePlanReminder,
  type CarePlanWithDetails,
} from './types';

// ============================================================================
// CARE PLAN (Parent)
// ============================================================================

export async function getCarePlanForPatient(patientId: string): Promise<CarePlanWithDetails | null> {
  await requireRole('doctor', 'staff', 'patient');
  const supabase = await createServerSupabaseClient();
  const profile = await getOrCreateProfile();

  if (!profile) {
    throw new Error('Failed to get user profile');
  }

  // Fetch the care plan
  const { data: carePlan, error: cpError } = await supabase
    .from('care_plans')
    .select('*')
    .eq('patient_id', patientId)
    .eq('clinic_id', profile.clinic_id)
    .single();

  if (cpError || !carePlan) {
    return null;
  }

  // Fetch all related data in parallel
  const [medicinesResult, followUpsResult, suggestionsResult, remindersResult] = await Promise.all([
    supabase
      .from('care_plan_medicines')
      .select('*')
      .eq('care_plan_id', carePlan.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('care_plan_follow_ups')
      .select('*')
      .eq('care_plan_id', carePlan.id)
      .order('scheduled_date', { ascending: true, nullsFirst: false }),
    supabase
      .from('care_plan_suggestions')
      .select('*')
      .eq('care_plan_id', carePlan.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('care_plan_reminders')
      .select('*')
      .eq('care_plan_id', carePlan.id)
      .order('created_at', { ascending: false }),
  ]);

  return {
    ...carePlan,
    medicines: medicinesResult.data ?? [],
    follow_ups: followUpsResult.data ?? [],
    suggestions: suggestionsResult.data ?? [],
    reminders: remindersResult.data ?? [],
  };
}

export async function createOrUpdateCarePlan(
  patientId: string,
  data: CarePlanFormData
): Promise<CarePlan> {
  await requireRole('doctor', 'staff');
  const supabase = await createServerSupabaseClient();
  const profile = await getOrCreateProfile();

  if (!profile) {
    throw new Error('Failed to get user profile');
  }

  // Validate input
  const validated = carePlanFormSchema.parse(data);

  // Try to fetch existing care plan
  const { data: existingPlan } = await supabase
    .from('care_plans')
    .select('id')
    .eq('patient_id', patientId)
    .eq('clinic_id', profile.clinic_id)
    .single();

  if (existingPlan) {
    // Update existing
    const { data: updated, error } = await supabase
      .from('care_plans')
      .update({
        notes: validated.notes,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existingPlan.id)
      .select()
      .single();

    if (error) throw new Error(`Failed to update care plan: ${error.message}`);
    return updated;
  } else {
    // Create new
    const { data: created, error } = await supabase
      .from('care_plans')
      .insert({
        clinic_id: profile.clinic_id,
        patient_id: patientId,
        created_by_id: profile.id,
        notes: validated.notes,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create care plan: ${error.message}`);
    return created;
  }
}

// ============================================================================
// MEDICINES
// ============================================================================

export async function addMedicine(
  carePlanId: string,
  data: CarePlanMedicineFormData
): Promise<CarePlanMedicine> {
  await requireRole('doctor', 'staff');
  const supabase = await createServerSupabaseClient();
  const profile = await getOrCreateProfile();

  if (!profile) {
    throw new Error('Failed to get user profile');
  }

  const validated = carePlanMedicineFormSchema.parse(data);

  const { data: result, error } = await supabase
    .from('care_plan_medicines')
    .insert({
      care_plan_id: carePlanId,
      clinic_id: profile.clinic_id,
      medicine_name: validated.medicine_name,
      strength: validated.strength,
      unit: validated.unit,
      frequency: validated.frequency,
      duration_value: validated.duration_value,
      duration_unit: validated.duration_unit,
      instructions: validated.instructions,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to add medicine: ${error.message}`);
  return result;
}

export async function updateMedicine(
  medicineId: string,
  data: CarePlanMedicineFormData
): Promise<CarePlanMedicine> {
  await requireRole('doctor', 'staff');
  const supabase = await createServerSupabaseClient();

  const validated = carePlanMedicineFormSchema.parse(data);

  const { data: result, error } = await supabase
    .from('care_plan_medicines')
    .update({
      medicine_name: validated.medicine_name,
      strength: validated.strength,
      unit: validated.unit,
      frequency: validated.frequency,
      duration_value: validated.duration_value,
      duration_unit: validated.duration_unit,
      instructions: validated.instructions,
      updated_at: new Date().toISOString(),
    })
    .eq('id', medicineId)
    .select()
    .single();

  if (error) throw new Error(`Failed to update medicine: ${error.message}`);
  return result;
}

export async function deleteMedicine(medicineId: string): Promise<void> {
  await requireRole('doctor', 'staff');
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase.from('care_plan_medicines').delete().eq('id', medicineId);

  if (error) throw new Error(`Failed to delete medicine: ${error.message}`);
}

// ============================================================================
// FOLLOW-UPS
// ============================================================================

export async function addFollowUp(
  carePlanId: string,
  data: CarePlanFollowUpFormData
): Promise<CarePlanFollowUp> {
  await requireRole('doctor', 'staff');
  const supabase = await createServerSupabaseClient();
  const profile = await getOrCreateProfile();

  if (!profile) {
    throw new Error('Failed to get user profile');
  }

  const validated = carePlanFollowUpFormSchema.parse(data);

  const { data: result, error } = await supabase
    .from('care_plan_follow_ups')
    .insert({
      care_plan_id: carePlanId,
      clinic_id: profile.clinic_id,
      description: validated.description,
      scheduled_date: validated.scheduled_date,
      priority: validated.priority,
      status: validated.status,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to add follow-up: ${error.message}`);
  return result;
}

export async function updateFollowUp(
  followUpId: string,
  data: CarePlanFollowUpFormData
): Promise<CarePlanFollowUp> {
  await requireRole('doctor', 'staff');
  const supabase = await createServerSupabaseClient();

  const validated = carePlanFollowUpFormSchema.parse(data);

  const { data: result, error } = await supabase
    .from('care_plan_follow_ups')
    .update({
      description: validated.description,
      scheduled_date: validated.scheduled_date,
      priority: validated.priority,
      status: validated.status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', followUpId)
    .select()
    .single();

  if (error) throw new Error(`Failed to update follow-up: ${error.message}`);
  return result;
}

export async function deleteFollowUp(followUpId: string): Promise<void> {
  await requireRole('doctor', 'staff');
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase.from('care_plan_follow_ups').delete().eq('id', followUpId);

  if (error) throw new Error(`Failed to delete follow-up: ${error.message}`);
}

// ============================================================================
// SUGGESTIONS
// ============================================================================

export async function addSuggestion(
  carePlanId: string,
  data: CarePlanSuggestionFormData
): Promise<CarePlanSuggestion> {
  await requireRole('doctor', 'staff');
  const supabase = await createServerSupabaseClient();
  const profile = await getOrCreateProfile();

  if (!profile) {
    throw new Error('Failed to get user profile');
  }

  const validated = carePlanSuggestionFormSchema.parse(data);

  const { data: result, error } = await supabase
    .from('care_plan_suggestions')
    .insert({
      care_plan_id: carePlanId,
      clinic_id: profile.clinic_id,
      suggestion_text: validated.suggestion_text,
      category: validated.category,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to add suggestion: ${error.message}`);
  return result;
}

export async function updateSuggestion(
  suggestionId: string,
  data: CarePlanSuggestionFormData
): Promise<CarePlanSuggestion> {
  await requireRole('doctor', 'staff');
  const supabase = await createServerSupabaseClient();

  const validated = carePlanSuggestionFormSchema.parse(data);

  const { data: result, error } = await supabase
    .from('care_plan_suggestions')
    .update({
      suggestion_text: validated.suggestion_text,
      category: validated.category,
      updated_at: new Date().toISOString(),
    })
    .eq('id', suggestionId)
    .select()
    .single();

  if (error) throw new Error(`Failed to update suggestion: ${error.message}`);
  return result;
}

export async function deleteSuggestion(suggestionId: string): Promise<void> {
  await requireRole('doctor', 'staff');
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase.from('care_plan_suggestions').delete().eq('id', suggestionId);

  if (error) throw new Error(`Failed to delete suggestion: ${error.message}`);
}

// ============================================================================
// REMINDERS
// ============================================================================

export async function addReminder(
  carePlanId: string,
  data: CarePlanReminderFormData
): Promise<CarePlanReminder> {
  await requireRole('doctor', 'staff');
  const supabase = await createServerSupabaseClient();
  const profile = await getOrCreateProfile();

  if (!profile) {
    throw new Error('Failed to get user profile');
  }

  const validated = carePlanReminderFormSchema.parse(data);

  const { data: result, error } = await supabase
    .from('care_plan_reminders')
    .insert({
      care_plan_id: carePlanId,
      clinic_id: profile.clinic_id,
      reminder_type: validated.reminder_type,
      target_id: validated.target_id,
      reminder_text: validated.reminder_text,
      frequency: validated.frequency,
      start_date: validated.start_date,
      end_date: validated.end_date,
      enabled: validated.enabled,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to add reminder: ${error.message}`);
  return result;
}

export async function updateReminder(
  reminderId: string,
  data: CarePlanReminderFormData
): Promise<CarePlanReminder> {
  await requireRole('doctor', 'staff');
  const supabase = await createServerSupabaseClient();

  const validated = carePlanReminderFormSchema.parse(data);

  const { data: result, error } = await supabase
    .from('care_plan_reminders')
    .update({
      reminder_type: validated.reminder_type,
      target_id: validated.target_id,
      reminder_text: validated.reminder_text,
      frequency: validated.frequency,
      start_date: validated.start_date,
      end_date: validated.end_date,
      enabled: validated.enabled,
      updated_at: new Date().toISOString(),
    })
    .eq('id', reminderId)
    .select()
    .single();

  if (error) throw new Error(`Failed to update reminder: ${error.message}`);
  return result;
}

export async function deleteReminder(reminderId: string): Promise<void> {
  await requireRole('doctor', 'staff');
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase.from('care_plan_reminders').delete().eq('id', reminderId);

  if (error) throw new Error(`Failed to delete reminder: ${error.message}`);
}