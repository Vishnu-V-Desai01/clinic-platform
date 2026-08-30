// src/features/appointments/document-storage.ts
//
// Item 6: uploads a generated prescription PDF to Supabase Storage and
// creates its documents row. Mirrors features/payments/document-storage.ts
// and features/pharmacy/document-storage.ts exactly — same bucket, same
// upload-then-insert pattern, same "if the DB insert fails, roll back the
// storage upload" cleanup. document_type = 'prescription' requires
// encounter_id (not payment_id) per the Item 6 migration's anchor
// constraint.

'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getOrCreateProfile } from '@/lib/supabase/profile';
import { generatePrescriptionDocument } from './document-generator';

const STORAGE_BUCKET = 'clinic-documents';

export type PrescriptionDocument = {
  id: string;
  file_path: string;
};

/**
 * Generate (if not already generated) and store the prescription PDF for
 * an encounter. Idempotent — returns the existing document row if one was
 * already created for this encounter, rather than generating a duplicate.
 * Returns null if generation or storage fails, or if the encounter has no
 * active prescriptions to include.
 */
export async function generateAndStorePrescriptionDocument(
  encounterId: string
): Promise<PrescriptionDocument | null> {
  const supabase = createServerSupabaseClient();
  const profile = await getOrCreateProfile();

  if (!profile) {
    console.error('[generateAndStorePrescriptionDocument] No profile');
    return null;
  }

  const { data: encounter, error: encounterError } = await supabase
    .from('encounters')
    .select('id, patient_id')
    .eq('id', encounterId)
    .eq('clinic_id', profile.clinic_id)
    .single();

  if (encounterError || !encounter) {
    console.error('[generateAndStorePrescriptionDocument] Encounter not found');
    return null;
  }

  // Idempotent: a prescription document already exists for this encounter.
  const { data: existingDoc } = await supabase
    .from('documents')
    .select('id, file_path')
    .eq('encounter_id', encounterId)
    .eq('clinic_id', profile.clinic_id)
    .eq('document_type', 'prescription')
    .maybeSingle();

  if (existingDoc) {
    return existingDoc as PrescriptionDocument;
  }

  const buffer = await generatePrescriptionDocument(encounterId);
  if (!buffer) {
    console.error('[generateAndStorePrescriptionDocument] PDF generation returned null');
    return null;
  }

  const fileName = `prescription_${encounter.patient_id}.pdf`;
  const filePath = `clinics/${profile.clinic_id}/encounters/${encounterId}/${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(filePath, buffer, {
      contentType: 'application/pdf',
      upsert: false,
    });

  if (uploadError) {
    console.error('[generateAndStorePrescriptionDocument] Storage upload failed:', uploadError);
    return null;
  }

  const { data: doc, error: insertError } = await supabase
    .from('documents')
    .insert({
      clinic_id: profile.clinic_id,
      encounter_id: encounterId,
      patient_id: encounter.patient_id,
      document_type: 'prescription',
      file_name: fileName,
      file_path: filePath,
      file_size_bytes: buffer.length,
      mime_type: 'application/pdf',
      is_final: true,
      created_by: profile.id,
    })
    .select('id, file_path')
    .single();

  if (insertError) {
    console.error('[generateAndStorePrescriptionDocument] DB insert failed:', insertError);
    await supabase.storage.from(STORAGE_BUCKET).remove([filePath]);
    return null;
  }

  return doc as PrescriptionDocument;
}