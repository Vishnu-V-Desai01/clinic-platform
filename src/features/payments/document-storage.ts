// src/features/payments/document-storage.ts

'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getOrCreateProfile, requireRole } from '@/lib/supabase/profile';
import {
  generatePaymentReceipt,
  generateTreatmentDetailsDocument,
} from './document-generator';
import type { Document } from './types';

const STORAGE_BUCKET = 'clinic-documents';

/**
 * Generate and store any MISSING documents for a payment (receipt and/or
 * treatment details). Safe to call repeatedly — skips document types that
 * already exist instead of violating the unique constraint.
 */
export async function generateAndStorePaymentDocuments(
  paymentId: string
): Promise<Document[]> {
  const supabase = createServerSupabaseClient();
  const profile = await getOrCreateProfile();

  if (!profile) {
    console.error('[generateAndStorePaymentDocuments] No profile');
    return [];
  }

  requireRole('doctor', 'staff');

  const { data: payment, error: paymentError } = await supabase
    .from('payments')
    .select('*')
    .eq('id', paymentId)
    .eq('clinic_id', profile.clinic_id)
    .single();

  if (paymentError || !payment) {
    console.error('[generateAndStorePaymentDocuments] Payment not found');
    return [];
  }

  // Check what's already generated to avoid duplicate-key violations
  const { data: existingDocs } = await supabase
    .from('documents')
    .select('document_type')
    .eq('payment_id', paymentId)
    .eq('clinic_id', profile.clinic_id);

  const existingTypes = new Set((existingDocs || []).map((d: any) => d.document_type));

  const documents: Document[] = [];

  try {
    if (!existingTypes.has('receipt')) {
      const receiptBuffer = await generatePaymentReceipt(paymentId);
      if (receiptBuffer) {
        const receiptDoc = await uploadDocument(
          paymentId,
          'receipt',
          receiptBuffer,
          payment,
          profile
        );
        if (receiptDoc) documents.push(receiptDoc);
      }
    }

    if (!existingTypes.has('treatment_details')) {
      const treatmentBuffer = await generateTreatmentDetailsDocument(paymentId);
      if (treatmentBuffer) {
        const treatmentDoc = await uploadDocument(
          paymentId,
          'treatment_details',
          treatmentBuffer,
          payment,
          profile
        );
        if (treatmentDoc) documents.push(treatmentDoc);
      }
    }

    return documents;
  } catch (error) {
    console.error('[generateAndStorePaymentDocuments]', error);
    return documents;
  }
}

/**
 * Upload a single document to Supabase Storage and create a document record.
 * Internal helper — not exported, so it's not part of the Server Action surface.
 */
async function uploadDocument(
  paymentId: string,
  documentType: 'receipt' | 'treatment_details',
  buffer: Buffer,
  payment: any,
  profile: any
): Promise<Document | null> {
  const supabase = createServerSupabaseClient();

  try {
    const fileExtension = 'pdf';
    const fileName =
      documentType === 'receipt'
        ? `receipt_${payment.patient_id}.${fileExtension}`
        : `treatment_details_${payment.patient_id}.${fileExtension}`;

    const filePath = `clinics/${profile.clinic_id}/payments/${paymentId}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(filePath, buffer, {
        contentType: 'application/pdf',
        upsert: false,
      });

    if (uploadError) {
      console.error(`[uploadDocument] Storage upload failed for ${documentType}:`, uploadError);
      return null;
    }

    const { data: doc, error: insertError } = await supabase
      .from('documents')
      .insert({
        clinic_id: profile.clinic_id,
        payment_id: paymentId,
        patient_id: payment.patient_id,
        document_type: documentType,
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
      console.error(`[uploadDocument] DB insert failed for ${documentType}:`, insertError);
      await supabase.storage.from(STORAGE_BUCKET).remove([filePath]);
      return null;
    }

    return doc as Document;
  } catch (error) {
    console.error(`[uploadDocument] Error for ${documentType}:`, error);
    return null;
  }
}

/**
 * Get a signed download URL for a document by document ID.
 * Doctor/staff only.
 */
export async function getDocumentDownloadUrl(
  documentId: string,
  expirySeconds: number = 3600
): Promise<string | null> {
  const supabase = createServerSupabaseClient();
  const profile = await getOrCreateProfile();

  if (!profile) {
    return null;
  }

  requireRole('doctor', 'staff');

  const { data: doc, error: fetchError } = await supabase
    .from('documents')
    .select('*')
    .eq('id', documentId)
    .eq('clinic_id', profile.clinic_id)
    .single();

  if (fetchError || !doc) {
    console.error('[getDocumentDownloadUrl] Document not found');
    return null;
  }

  try {
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(doc.file_path, expirySeconds);

    if (error) {
      console.error('[getDocumentDownloadUrl] Failed to create signed URL:', error);
      return null;
    }

    return data?.signedUrl || null;
  } catch (error) {
    console.error('[getDocumentDownloadUrl]', error);
    return null;
  }
}

/**
 * Convenience helper: look up the receipt for a payment (by payment ID,
 * not document ID) and return a signed download URL directly.
 * Used by the Payments dashboard's one-click "download receipt" icon.
 */
export async function getReceiptDownloadUrlForPayment(
  paymentId: string
): Promise<string | null> {
  const supabase = createServerSupabaseClient();
  const profile = await getOrCreateProfile();

  if (!profile) {
    return null;
  }

  requireRole('doctor', 'staff');

  const { data: doc, error } = await supabase
    .from('documents')
    .select('*')
    .eq('payment_id', paymentId)
    .eq('clinic_id', profile.clinic_id)
    .eq('document_type', 'receipt')
    .single();

  if (error || !doc) {
    console.error('[getReceiptDownloadUrlForPayment] Receipt not found');
    return null;
  }

  try {
    const { data, error: urlError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(doc.file_path, 3600);

    if (urlError) {
      console.error('[getReceiptDownloadUrlForPayment]', urlError);
      return null;
    }

    return data?.signedUrl || null;
  } catch (err) {
    console.error('[getReceiptDownloadUrlForPayment]', err);
    return null;
  }
}

/**
 * List all documents for a payment.
 * Doctor/staff only.
 */
export async function listPaymentDocuments(paymentId: string): Promise<Document[]> {
  const supabase = createServerSupabaseClient();
  const profile = await getOrCreateProfile();

  if (!profile) {
    return [];
  }

  requireRole('doctor', 'staff');

  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('payment_id', paymentId)
    .eq('clinic_id', profile.clinic_id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[listPaymentDocuments]', error);
    return [];
  }

  return (data || []) as Document[];
}

/**
 * List all documents for a patient (across all payments).
 * Doctor/staff only.
 */
export async function listPatientDocuments(patientId: string): Promise<Document[]> {
  const supabase = createServerSupabaseClient();
  const profile = await getOrCreateProfile();

  if (!profile) {
    return [];
  }

  requireRole('doctor', 'staff');

  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('patient_id', patientId)
    .eq('clinic_id', profile.clinic_id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[listPatientDocuments]', error);
    return [];
  }

  return (data || []) as Document[];
}