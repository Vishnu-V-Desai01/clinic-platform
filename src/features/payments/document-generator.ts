// src/features/payments/document-generator.ts

import PDFDocument from 'pdfkit';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getOrCreateProfile } from '@/lib/supabase/profile';

function patientFullName(patients: any): string {
  return `${patients?.first_name || ''} ${patients?.last_name || ''}`.trim() || 'Unknown';
}

/**
 * Generate a PDF receipt for an approved payment.
 * Returns a Promise<Buffer>.
 */
export async function generatePaymentReceipt(paymentId: string): Promise<Buffer | null> {
  const supabase = createServerSupabaseClient();
  const profile = await getOrCreateProfile();

  if (!profile) return null;

  const { data: payment, error: paymentError } = await supabase
    .from('payments')
    .select(
      `
      *,
      patients (first_name, last_name, patient_id_number),
      appointments (appointment_datetime, appointment_type),
      profiles!created_by (full_name),
      payment_collections (
        id,
        amount_collected,
        collection_date,
        payment_method,
        transaction_reference
      )
    `
    )
    .eq('id', paymentId)
    .eq('clinic_id', profile.clinic_id)
    .single();

  if (paymentError || !payment) {
    console.error('[generatePaymentReceipt] Payment not found');
    return null;
  }

  try {
    const doc = new PDFDocument();
    const buffers: Buffer[] = [];

    doc.on('data', (chunk) => buffers.push(chunk));

    const appointmentDate = payment.appointments?.appointment_datetime
      ? new Date(payment.appointments.appointment_datetime).toLocaleDateString('en-IN')
      : 'N/A';

    const serviceLabel =
      payment.appointments?.appointment_type ||
      payment.description ||
      'Charge';

    // Header
    doc.fontSize(20).font('Helvetica-Bold').text('Payment Receipt', { align: 'center' });
    doc.moveDown();

    // Receipt details
    doc.fontSize(12).font('Helvetica');
    doc.text(`Receipt Date: ${new Date().toLocaleDateString('en-IN')}`);
    doc.text(`Payment ID: ${paymentId}`);
    doc.moveDown();

    // Patient Information
    doc.fontSize(14).font('Helvetica-Bold').text('Patient Information');
    doc.fontSize(11).font('Helvetica');
    doc.text(`Name: ${patientFullName(payment.patients)}`);
    doc.text(`MRN: ${payment.patients?.patient_id_number || 'N/A'}`);
    doc.moveDown();

    // Appointment / Charge Details
    doc.fontSize(14).font('Helvetica-Bold').text('Charge Details');
    doc.fontSize(11).font('Helvetica');
    doc.text(`Service: ${serviceLabel}`);
    doc.text(`Date: ${appointmentDate}`);
    doc.text(`Doctor: ${payment.profiles?.full_name || 'N/A'}`);
    doc.moveDown();

    // Payment Summary
    doc.fontSize(14).font('Helvetica-Bold').text('Payment Summary');
    doc.fontSize(11).font('Helvetica');
    doc.text(`Amount Charged: Rs.${payment.amount_charged.toFixed(2)}`);
    doc.text(`Amount Paid: Rs.${payment.amount_paid.toFixed(2)}`);
    doc.fillColor(payment.outstanding_balance > 0 ? 'red' : 'black');
    doc.text(`Outstanding Balance: Rs.${payment.outstanding_balance.toFixed(2)}`);
    doc.fillColor('black');
    doc.moveDown();

    // Collection History
    const collections = payment.payment_collections || [];
    if (collections.length > 0) {
      doc.fontSize(14).font('Helvetica-Bold').text('Collection History');
      doc.fontSize(10).font('Helvetica');

      const col1X = 50;
      const col2X = 200;
      const col3X = 350;

      doc.font('Helvetica-Bold');
      doc.text('Date', col1X, doc.y, { width: 150 });
      doc.text('Method', col2X, doc.y - 12, { width: 150 });
      doc.text('Amount', col3X, doc.y - 12, { width: 100 });
      doc.moveDown();

      doc.font('Helvetica');
      collections.forEach((col: any) => {
        const collectionDate = new Date(col.collection_date).toLocaleDateString('en-IN');
        const y = doc.y;
        doc.text(collectionDate, col1X, y, { width: 150 });
        doc.text(col.payment_method, col2X, y, { width: 150 });
        doc.text(`Rs.${col.amount_collected.toFixed(2)}`, col3X, y, { width: 100 });
        doc.moveDown();
      });
    }

    doc.moveDown();
    doc.fontSize(9).fillColor('#666');
    doc.text('This is an automatically generated receipt.');
    doc.text(`Generated on: ${new Date().toLocaleString('en-IN')}`);

    doc.end();

    return new Promise((resolve) => {
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', (err) => {
        console.error('[generatePaymentReceipt] PDF error:', err);
        resolve(null);
      });
    });
  } catch (error) {
    console.error('[generatePaymentReceipt] Error:', error);
    return null;
  }
}

/**
 * Generate a treatment details document (summary of care plan + medical records).
 * Returns a Promise<Buffer>.
 */
export async function generateTreatmentDetailsDocument(
  paymentId: string
): Promise<Buffer | null> {
  const supabase = createServerSupabaseClient();
  const profile = await getOrCreateProfile();

  if (!profile) return null;

  const { data: payment, error: paymentError } = await supabase
    .from('payments')
    .select(
      `
      *,
      patients (
        first_name,
        last_name,
        patient_id_number,
        blood_group,
        allergies,
        conditions,
        notes
      ),
      appointments (appointment_datetime, appointment_type)
    `
    )
    .eq('id', paymentId)
    .eq('clinic_id', profile.clinic_id)
    .single();

  if (paymentError || !payment) {
    console.error('[generateTreatmentDetailsDocument] Payment not found');
    return null;
  }

  const { data: encounters } = await supabase
    .from('encounters')
    .select(
      `
      *,
      diagnoses (diagnosis_code, diagnosis_name),
      prescriptions (medication_name, dosage, frequency, duration_days),
      test_results (test_name, result_value, result_unit)
    `
    )
    .eq('patient_id', payment.patient_id)
    .eq('clinic_id', profile.clinic_id)
    .order('encounter_date', { ascending: false })
    .limit(5);

  const { data: carePlan } = await supabase
    .from('care_plans')
    .select('*')
    .eq('patient_id', payment.patient_id)
    .eq('clinic_id', profile.clinic_id)
    .single();

  try {
    const doc = new PDFDocument();
    const buffers: Buffer[] = [];

    doc.on('data', (chunk) => buffers.push(chunk));

    // Header
    doc.fontSize(20).font('Helvetica-Bold').text('Treatment Details Document', { align: 'center' });
    doc.moveDown();

    // Patient Info
    doc.fontSize(14).font('Helvetica-Bold').text('Patient Information');
    doc.fontSize(11).font('Helvetica');
    doc.text(`Name: ${patientFullName(payment.patients)}`);
    doc.text(`MRN: ${payment.patients?.patient_id_number || 'N/A'}`);
    doc.text(`Blood Group: ${payment.patients?.blood_group || 'N/A'}`);

    if (payment.patients?.allergies?.length > 0) {
      doc.text(`Allergies: ${payment.patients.allergies.join(', ')}`);
    }

    if (payment.patients?.conditions?.length > 0) {
      doc.text(`Conditions: ${payment.patients.conditions.join(', ')}`);
    }

    if (payment.patients?.notes) {
      doc.text(`Notes: ${payment.patients.notes}`);
    }
    doc.moveDown();

    // Care Plan
    if (carePlan) {
      doc.fontSize(14).font('Helvetica-Bold').text('Current Care Plan');
      doc.fontSize(11).font('Helvetica');
      if (carePlan.plan_name) doc.text(`Plan: ${carePlan.plan_name}`);
      if (carePlan.medications) {
        doc.text(`Medications: ${carePlan.medications.join(', ')}`);
      }
      if (carePlan.follow_up_instructions) {
        doc.text(`Follow-up: ${carePlan.follow_up_instructions}`);
      }
      doc.moveDown();
    }

    // Recent Encounters
    if (encounters && encounters.length > 0) {
      doc.fontSize(14).font('Helvetica-Bold').text('Recent Encounters');
      doc.fontSize(10).font('Helvetica');

      encounters.forEach((enc: any) => {
        const encDate = new Date(enc.encounter_date).toLocaleDateString('en-IN');
        doc.font('Helvetica-Bold').text(`${encDate} - ${enc.encounter_type}`);
        doc.font('Helvetica');

        if (enc.diagnoses?.length > 0) {
          const names = enc.diagnoses.map((d: any) => d.diagnosis_name).join(', ');
          doc.text(`Diagnoses: ${names}`);
        }

        if (enc.prescriptions?.length > 0) {
          const meds = enc.prescriptions.map((p: any) => p.medication_name).join(', ');
          doc.text(`Medications: ${meds}`);
        }

        if (enc.observation_notes) {
          doc.text(`Notes: ${enc.observation_notes}`);
        }

        doc.moveDown(0.5);
      });
    }

    doc.moveDown();
    doc.fontSize(9).fillColor('#666');
    doc.text('This document is part of the patient medical record.');
    doc.text(`Generated on: ${new Date().toLocaleString('en-IN')}`);

    doc.end();

    return new Promise((resolve) => {
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', (err) => {
        console.error('[generateTreatmentDetailsDocument] PDF error:', err);
        resolve(null);
      });
    });
  } catch (error) {
    console.error('[generateTreatmentDetailsDocument] Error:', error);
    return null;
  }
}