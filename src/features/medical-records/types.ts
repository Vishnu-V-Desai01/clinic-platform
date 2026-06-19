// ---------------------------------------------------------------
// Medical Records — TypeScript types
// DB values: lowercase. Display labels applied at render only.
// ---------------------------------------------------------------

export type EncounterStatus    = 'active' | 'completed' | 'cancelled'
export type DiagnosisSeverity  = 'mild' | 'moderate' | 'severe'
export type DiagnosisStatus    = 'active' | 'resolved' | 'inactive'
export type PrescriptionStatus = 'active' | 'stopped' | 'completed'
export type TestResultStatus   = 'ordered' | 'pending' | 'completed'

// ---------------------------------------------------------------
// ENCOUNTER
// ---------------------------------------------------------------
export interface Encounter {
  id:              string
  clinic_id:       string
  patient_id:      string
  doctor_id:       string
  encounter_date:  string
  chief_complaint: string | null
  notes:           string | null
  status:          EncounterStatus
  created_at:      string
  updated_at:      string
}

// ---------------------------------------------------------------
// DIAGNOSIS
// ---------------------------------------------------------------
export interface Diagnosis {
  id:             string
  clinic_id:      string
  encounter_id:   string
  patient_id:     string
  condition_name: string
  code:           string | null
  code_system:    string | null
  severity:       DiagnosisSeverity | null
  status:         DiagnosisStatus
  notes:          string | null
  created_at:     string
  updated_at:     string
}

// ---------------------------------------------------------------
// OBSERVATION
// ---------------------------------------------------------------
export interface Observation {
  id:               string
  clinic_id:        string
  encounter_id:     string
  patient_id:       string
  observation_type: string
  value:            string
  unit:             string | null
  code:             string | null
  code_system:      string | null
  notes:            string | null
  created_at:       string
  updated_at:       string
}

// ---------------------------------------------------------------
// PRESCRIPTION
// ---------------------------------------------------------------
export interface Prescription {
  id:            string
  clinic_id:     string
  encounter_id:  string
  patient_id:    string
  medicine_name: string
  dosage:        string | null
  frequency:     string | null
  duration:      string | null
  instructions:  string | null
  status:        PrescriptionStatus
  created_at:    string
  updated_at:    string
}

// ---------------------------------------------------------------
// TEST RESULT
// ---------------------------------------------------------------
export interface TestResult {
  id:              string
  clinic_id:       string
  encounter_id:    string
  patient_id:      string
  test_name:       string
  result_value:    string | null
  result_text:     string | null
  reference_range: string | null
  is_abnormal:     boolean
  status:          TestResultStatus
  code:            string | null
  code_system:     string | null
  notes:           string | null
  created_at:      string
  updated_at:      string
}

// ---------------------------------------------------------------
// ENCOUNTER WITH ALL CHILDREN
// Used for the encounter detail / edit view
// ---------------------------------------------------------------
export interface EncounterWithDetails extends Encounter {
  diagnoses:     Diagnosis[]
  observations:  Observation[]
  prescriptions: Prescription[]
  test_results:  TestResult[]
}

// ---------------------------------------------------------------
// DISPLAY LABELS
// Apply at render — never store display strings in DB
// ---------------------------------------------------------------
export const ENCOUNTER_STATUS_LABELS: Record<EncounterStatus, string> = {
  active:    'Active',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

export const DIAGNOSIS_SEVERITY_LABELS: Record<DiagnosisSeverity, string> = {
  mild:     'Mild',
  moderate: 'Moderate',
  severe:   'Severe',
}

export const DIAGNOSIS_STATUS_LABELS: Record<DiagnosisStatus, string> = {
  active:   'Active',
  resolved: 'Resolved',
  inactive: 'Inactive',
}

export const PRESCRIPTION_STATUS_LABELS: Record<PrescriptionStatus, string> = {
  active:    'Active',
  stopped:   'Stopped',
  completed: 'Completed',
}

export const TEST_RESULT_STATUS_LABELS: Record<TestResultStatus, string> = {
  ordered:   'Ordered',
  pending:   'Pending',
  completed: 'Completed',
}

// ---------------------------------------------------------------
// COMMON OBSERVATION TYPES
// Used in the vitals dropdown — maps type value → label + default unit
// ---------------------------------------------------------------
export const COMMON_OBSERVATION_TYPES = [
  { value: 'blood_pressure',     label: 'Blood Pressure',            unit: 'mmHg'         },
  { value: 'heart_rate',         label: 'Heart Rate',                unit: 'bpm'          },
  { value: 'temperature',        label: 'Temperature',               unit: '°F'           },
  { value: 'respiratory_rate',   label: 'Respiratory Rate',          unit: 'breaths/min'  },
  { value: 'oxygen_saturation',  label: 'Oxygen Saturation (SpO₂)',  unit: '%'            },
  { value: 'weight',             label: 'Weight',                    unit: 'kg'           },
  { value: 'height',             label: 'Height',                    unit: 'cm'           },
  { value: 'bmi',                label: 'BMI',                       unit: 'kg/m²'        },
  { value: 'blood_glucose',      label: 'Blood Glucose',             unit: 'mg/dL'        },
  { value: 'other',              label: 'Other',                     unit: ''             },
] as const

export type ObservationType = typeof COMMON_OBSERVATION_TYPES[number]['value']