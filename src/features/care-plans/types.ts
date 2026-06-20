// src/features/care-plans/types.ts

export interface CarePlan {
  id: string;
  clinic_id: string;
  patient_id: string;
  created_by_id: string;
  created_at: string;
  updated_at: string;
  notes: string | null;
}

export interface CarePlanMedicine {
  id: string;
  care_plan_id: string;
  clinic_id: string;
  medicine_name: string;
  strength: string | null;
  unit: string | null;
  frequency: string;
  duration_value: number | null;
  duration_unit: string | null;
  instructions: string | null;
  created_at: string;
  updated_at: string;
}

export interface CarePlanFollowUp {
  id: string;
  care_plan_id: string;
  clinic_id: string;
  description: string;
  scheduled_date: string | null;
  priority: string | null;
  status: 'pending' | 'completed' | 'cancelled';
  created_at: string;
  updated_at: string;
}

export interface CarePlanSuggestion {
  id: string;
  care_plan_id: string;
  clinic_id: string;
  suggestion_text: string;
  category: string | null;
  created_at: string;
  updated_at: string;
}

export interface CarePlanReminder {
  id: string;
  care_plan_id: string;
  clinic_id: string;
  reminder_type: 'medicine' | 'follow_up' | 'suggestion';
  target_id: string | null;
  reminder_text: string;
  frequency: string;
  start_date: string | null;
  end_date: string | null;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface CarePlanWithDetails extends CarePlan {
  medicines: CarePlanMedicine[];
  follow_ups: CarePlanFollowUp[];
  suggestions: CarePlanSuggestion[];
  reminders: CarePlanReminder[];
}