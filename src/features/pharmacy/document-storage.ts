// src/features/pharmacy/document-storage.ts
//
// Mirrors src/features/payments/document-storage.ts, but for medicine
// receipts specifically: one document type ('medicine_receipt'), not two.
// Kept separate rather than extending the payments version because that
// file's generateAndStorePaymentDocuments() always tries to produce BOTH
// 'receipt' and 'treatment_details' — bolting a third, differently-shaped
// document type onto that function would mean threading a payment_source
// branch through logic that otherwise has no reason to know about pharmacy.

'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getOrCreateProfile, requireRole } from '@/lib/supabase/profile';
import { generateMedicineReceipt } from './document-generator';

const STORAGE_BUCKET = 'clinic-documents';

export interface MedicineReceiptDocument {
  id: string;
  clinic_id: string;
  payment_id: string;
  patient_id: string;
  document_type: 'medicine_receipt';
  file_name: string;
  file_path: string;
  file_size_bytes: number | null;
  mime_type: string;
  is_final: boolean;
  created_at: string;
  created_by: string;
}

/**
 * Generate and store the medicine receipt PDF for a medicine payment, if it
 * doesn't already exist. Safe to call repeatedly.
 */
export async function generateAndStoreMedicineReceipt(
  paymentId: string
): Promise<MedicineReceiptDocument | null> {
  const supabase = createServerSupabaseClient();
  const profile = await getOrCreateProfile();

  if (!profile) {
    console.error('[generateAndStoreMedicineReceipt] No profile');
    return null;
  }

  await requireRole('doctor', 'staff');

  const { data: payment, error: paymentError } = await supabase
    .from('payments')
    .select('id, patient_id, payment_source')
    .eq('id', paymentId)
    .eq('clinic_id', profile.clinic_id)
    .single();

  if (paymentError || !payment) {
    console.error('[generateAndStoreMedicineReceipt] Payment not found');
    return null;
  }
  if (payment.payment_source !== 'medicine') {
    console.error('[generateAndStoreMedicineReceipt] Not a medicine payment');
    return null;
  }

  const { data: existing } = await supabase
    .from('documents')
    .select('*')
    .eq('payment_id', paymentId)
    .eq('clinic_id', profile.clinic_id)
    .eq('document_type', 'medicine_receipt')
    .maybeSingle();

  if (existing) return existing as MedicineReceiptDocument;

  try {
    const buffer = await generateMedicineReceipt(paymentId);
    if (!buffer) return null;

    const fileName = `medicine_receipt_${payment.patient_id}.pdf`;
    const filePath = `clinics/${profile.clinic_id}/payments/${paymentId}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(filePath, buffer, {
        contentType: 'application/pdf',
        upsert: false,
      });

    if (uploadError) {
      console.error('[generateAndStoreMedicineReceipt] Storage upload failed:', uploadError);
      return null;
    }

    const { data: doc, error: insertError } = await supabase
      .from('documents')
      .insert({
        clinic_id: profile.clinic_id,
        payment_id: paymentId,
        patient_id: payment.patient_id,
        document_type: 'medicine_receipt',
        file_name: fileName,
        file_path: filePath,
        file_size_bytes: buffer.length,
        mime_type: 'application/pdf',
        is_final: true,
        created_by: profile.id,
      })
      .select()
      .single();

    if (insertError) {
      console.error('[generateAndStoreMedicineReceipt] DB insert failed:', insertError);
      await supabase.storage.from(STORAGE_BUCKET).remove([filePath]);
      return null;
    }

    return doc as MedicineReceiptDocument;
  } catch (error) {
    console.error('[generateAndStoreMedicineReceipt] Error:', error);
    return null;
  }
}
