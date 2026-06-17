-- DPDP-compliant granular patient consent table
-- One row per patient per purpose; revoked in-place; never deleted (audit trail)
create table patient_consents (
  id          uuid        primary key default gen_random_uuid(),
  clinic_id   uuid        not null references clinics(id)  on delete cascade,
  patient_id  uuid        not null references patients(id) on delete cascade,

  -- Granular consent purpose
  -- Supported values:
  --   'data_processing'        – general health data processing  (DPDP baseline)
  --   'appointment_reminders'  – reminders sent for appointments
  --   'medication_reminders'   – reminders sent for medications
  --   'whatsapp_notifications' – any WhatsApp communication
  --   'care_plan_access'       – staff access to care plans and records
  --   'record_sharing'         – sharing records with other providers
  purpose     text        not null,

  -- Current state
  is_active   boolean     not null default true,

  -- Audit: who granted and when
  granted_by  uuid        references profiles(id) on delete set null,
  granted_at  timestamptz not null default now(),

  -- Audit: who revoked and when (null until revoked)
  revoked_by  uuid        references profiles(id) on delete set null,
  revoked_at  timestamptz,

  -- Optional reason or note recorded at grant or revocation
  notes       text,

  -- Reserved for future ABDM consent artifact mapping
  abdm_consent_id text,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- One record per patient per purpose (revoked-in-place model)
  unique (patient_id, purpose)
);

-- Indexes for common lookups
create index patient_consents_patient_id_idx on patient_consents (patient_id);
create index patient_consents_clinic_id_idx  on patient_consents (clinic_id);
create index patient_consents_purpose_idx    on patient_consents (purpose);

-- RLS
alter table patient_consents enable row level security;

-- Doctor and staff: read all consents in their clinic
create policy "clinic_members_select_consents"
on patient_consents for select
to authenticated
using (
  clinic_id = get_my_clinic_id()
  and get_my_role() in ('doctor', 'staff')
);

-- Doctor and staff: record new consent
create policy "clinic_members_insert_consents"
on patient_consents for insert
to authenticated
with check (
  clinic_id = get_my_clinic_id()
  and get_my_role() in ('doctor', 'staff')
);

-- Doctor and staff: update (revoke) an existing consent
create policy "clinic_members_update_consents"
on patient_consents for update
to authenticated
using (
  clinic_id = get_my_clinic_id()
  and get_my_role() in ('doctor', 'staff')
)
with check (
  clinic_id = get_my_clinic_id()
);

-- No DELETE policy: consents are audited and never deleted

comment on table patient_consents is
  'DPDP-compliant granular patient consent records. Maps to ABDM consent artifacts in a future chat.';
comment on column patient_consents.purpose is
  'Consent purpose: data_processing | appointment_reminders | medication_reminders | whatsapp_notifications | care_plan_access | record_sharing';
comment on column patient_consents.abdm_consent_id is
  'Reserved for future ABDM consent artifact ID; null until that integration is built.';