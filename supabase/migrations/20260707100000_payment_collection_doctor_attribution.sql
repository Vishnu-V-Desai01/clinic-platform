-- Migration: payment_collection_doctor_attribution
-- Chat 13 — extends doctor attribution to payment_collections (Option 2:
-- captured fresh at each collection event, not inherited from the bill).
--
-- payments.doctor_id already exists from the prior migration in this chat.
-- This adds the same pattern to payment_collections, since a single bill
-- can be paid across multiple collection events by different people.

begin;

alter table payment_collections
  add column doctor_id uuid references profiles(id) on delete set null;

create index payment_collections_doctor_id_idx on payment_collections(doctor_id);

-- Backfill: where the person who collected (collected_by) was themselves a
-- doctor, that doctor is unambiguously correct — copy it across. Where
-- collected_by was staff, there's no reliable source to infer from (this
-- column didn't exist yet), so those stay NULL — "Unassigned" until a real
-- collection happens through the new required-field flow.
update payment_collections pc
set doctor_id = pc.collected_by
from profiles p
where pc.collected_by = p.id
  and p.role = 'doctor'
  and pc.doctor_id is null;

commit;