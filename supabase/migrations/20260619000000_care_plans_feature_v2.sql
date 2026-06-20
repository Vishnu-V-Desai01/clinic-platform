-- Chat 9: Care Plans Feature Migration
-- Forward-looking clinical intentions (medicines, follow-ups, suggestions, reminders)
-- Separate from Medical Records (historical) to avoid duplication

-- Create update_timestamp function if it doesn't exist
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Parent table: Care Plans (one active per patient per clinic)
CREATE TABLE care_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  created_by_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  notes TEXT,
  UNIQUE(clinic_id, patient_id)
);

CREATE INDEX idx_care_plans_clinic_patient ON care_plans(clinic_id, patient_id);
CREATE INDEX idx_care_plans_created_by ON care_plans(created_by_id);

-- Medicines: prescribed within the care plan
CREATE TABLE care_plan_medicines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  care_plan_id UUID NOT NULL REFERENCES care_plans(id) ON DELETE CASCADE,
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  medicine_name TEXT NOT NULL,
  strength TEXT,
  unit TEXT,
  frequency TEXT NOT NULL,
  duration_value INT,
  duration_unit TEXT,
  instructions TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_care_plan_medicines_plan ON care_plan_medicines(care_plan_id);
CREATE INDEX idx_care_plan_medicines_clinic ON care_plan_medicines(clinic_id);

-- Follow-ups: scheduled actions within the care plan
CREATE TABLE care_plan_follow_ups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  care_plan_id UUID NOT NULL REFERENCES care_plans(id) ON DELETE CASCADE,
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  scheduled_date DATE,
  priority TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_care_plan_follow_ups_plan ON care_plan_follow_ups(care_plan_id);
CREATE INDEX idx_care_plan_follow_ups_clinic ON care_plan_follow_ups(clinic_id);
CREATE INDEX idx_care_plan_follow_ups_status ON care_plan_follow_ups(status);

-- Suggestions: free-form clinical notes within the care plan
CREATE TABLE care_plan_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  care_plan_id UUID NOT NULL REFERENCES care_plans(id) ON DELETE CASCADE,
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  suggestion_text TEXT NOT NULL,
  category TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_care_plan_suggestions_plan ON care_plan_suggestions(care_plan_id);
CREATE INDEX idx_care_plan_suggestions_clinic ON care_plan_suggestions(clinic_id);

-- Reminders: automation definitions (what to remind, when, how often)
CREATE TABLE care_plan_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  care_plan_id UUID NOT NULL REFERENCES care_plans(id) ON DELETE CASCADE,
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  reminder_type TEXT NOT NULL,
  target_id UUID,
  reminder_text TEXT NOT NULL,
  frequency TEXT NOT NULL,
  start_date DATE,
  end_date DATE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_care_plan_reminders_plan ON care_plan_reminders(care_plan_id);
CREATE INDEX idx_care_plan_reminders_clinic ON care_plan_reminders(clinic_id);
CREATE INDEX idx_care_plan_reminders_enabled ON care_plan_reminders(enabled);

-- Updated-at triggers for all tables
CREATE TRIGGER care_plans_updated_at
BEFORE UPDATE ON care_plans
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER care_plan_medicines_updated_at
BEFORE UPDATE ON care_plan_medicines
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER care_plan_follow_ups_updated_at
BEFORE UPDATE ON care_plan_follow_ups
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER care_plan_suggestions_updated_at
BEFORE UPDATE ON care_plan_suggestions
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER care_plan_reminders_updated_at
BEFORE UPDATE ON care_plan_reminders
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

-- RLS: All care plan tables are clinic-scoped, doctor and staff only
ALTER TABLE care_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE care_plan_medicines ENABLE ROW LEVEL SECURITY;
ALTER TABLE care_plan_follow_ups ENABLE ROW LEVEL SECURITY;
ALTER TABLE care_plan_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE care_plan_reminders ENABLE ROW LEVEL SECURITY;

-- Care Plans
CREATE POLICY care_plans_access ON care_plans
  FOR SELECT USING (
    clinic_id = get_my_clinic_id() AND get_my_role() IN ('doctor', 'staff')
  );

CREATE POLICY care_plans_insert ON care_plans
  FOR INSERT WITH CHECK (
    clinic_id = get_my_clinic_id() AND get_my_role() IN ('doctor', 'staff')
  );

CREATE POLICY care_plans_update ON care_plans
  FOR UPDATE USING (
    clinic_id = get_my_clinic_id() AND get_my_role() IN ('doctor', 'staff')
  );

-- Medicines
CREATE POLICY care_plan_medicines_access ON care_plan_medicines
  FOR SELECT USING (
    clinic_id = get_my_clinic_id() AND get_my_role() IN ('doctor', 'staff')
  );

CREATE POLICY care_plan_medicines_insert ON care_plan_medicines
  FOR INSERT WITH CHECK (
    clinic_id = get_my_clinic_id() AND get_my_role() IN ('doctor', 'staff')
  );

CREATE POLICY care_plan_medicines_update ON care_plan_medicines
  FOR UPDATE USING (
    clinic_id = get_my_clinic_id() AND get_my_role() IN ('doctor', 'staff')
  );

-- Follow-ups
CREATE POLICY care_plan_follow_ups_access ON care_plan_follow_ups
  FOR SELECT USING (
    clinic_id = get_my_clinic_id() AND get_my_role() IN ('doctor', 'staff')
  );

CREATE POLICY care_plan_follow_ups_insert ON care_plan_follow_ups
  FOR INSERT WITH CHECK (
    clinic_id = get_my_clinic_id() AND get_my_role() IN ('doctor', 'staff')
  );

CREATE POLICY care_plan_follow_ups_update ON care_plan_follow_ups
  FOR UPDATE USING (
    clinic_id = get_my_clinic_id() AND get_my_role() IN ('doctor', 'staff')
  );

-- Suggestions
CREATE POLICY care_plan_suggestions_access ON care_plan_suggestions
  FOR SELECT USING (
    clinic_id = get_my_clinic_id() AND get_my_role() IN ('doctor', 'staff')
  );

CREATE POLICY care_plan_suggestions_insert ON care_plan_suggestions
  FOR INSERT WITH CHECK (
    clinic_id = get_my_clinic_id() AND get_my_role() IN ('doctor', 'staff')
  );

CREATE POLICY care_plan_suggestions_update ON care_plan_suggestions
  FOR UPDATE USING (
    clinic_id = get_my_clinic_id() AND get_my_role() IN ('doctor', 'staff')
  );

-- Reminders
CREATE POLICY care_plan_reminders_access ON care_plan_reminders
  FOR SELECT USING (
    clinic_id = get_my_clinic_id() AND get_my_role() IN ('doctor', 'staff')
  );

CREATE POLICY care_plan_reminders_insert ON care_plan_reminders
  FOR INSERT WITH CHECK (
    clinic_id = get_my_clinic_id() AND get_my_role() IN ('doctor', 'staff')
  );

CREATE POLICY care_plan_reminders_update ON care_plan_reminders
  FOR UPDATE USING (
    clinic_id = get_my_clinic_id() AND get_my_role() IN ('doctor', 'staff')
  );