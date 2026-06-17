-- Add FHIR/ABHA identity fields to patients
alter table patients
add column if not exists abha_number text,
add column if not exists abha_address text;

-- Add HPR ID (health practitioner registration) to profiles
alter table profiles
add column if not exists hpr_id text;

-- Add HFR ID (health facility registration) to clinics
alter table clinics
add column if not exists hfr_id text;

comment on column patients.abha_number is 'Ayushman Bharat Health Account (ABHA) number for ABDM integration';
comment on column patients.abha_address is 'ABHA address for ABDM integration';
comment on column profiles.hpr_id is 'Health Practitioner Registration ID (ABDM/NRR)';
comment on column clinics.hfr_id is 'Health Facility Registration ID (ABDM/HFR)';