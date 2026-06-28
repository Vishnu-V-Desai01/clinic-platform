// src/features/payments/document-generator.ts

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
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
      appointments (appointment_date),
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
    const pdfDoc = await PDFDocument.create();
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontReg = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const page = pdfDoc.addPage([595, 842]);
    const { width, height } = page.getSize();
    const margin = 50;
    let y = height - margin;

    const black = rgb(0, 0, 0);
    const gray = rgb(0.5, 0.5, 0.5);
    const red = rgb(0.8, 0, 0);
    const green = rgb(0.09, 0.64, 0.09);

    const drawText = (
      text: string,
      opts: {
        font?: typeof fontBold;
        size?: number;
        color?: ReturnType<typeof rgb>;
        indent?: number;
      } = {}
    ) => {
      const { font = fontReg, size = 10, color = black, indent = 0 } = opts;
      const maxChars = 90;
      const display = text.length > maxChars ? text.slice(0, maxChars) + '...' : text;
      page.drawText(display, { x: margin + indent, y, size, font, color });
      y -= size + 6;
    };

    const drawLine = (color = rgb(0.8, 0.8, 0.8)) => {
      page.drawLine({
        start: { x: margin, y },
        end: { x: width - margin, y },
        thickness: 0.5,
        color,
      });
      y -= 8;
    };

    const formatAmt = (v: number) =>
      'Rs. ' + Number(v).toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

    const patientName = patientFullName(payment.patients);
    const appointmentDate = payment.appointments?.appointment_date
      ? new Date(payment.appointments.appointment_date).toLocaleDateString('en-IN')
      : null;

    // Header
    const title = 'Payment Receipt';
    const titleWidth = fontBold.widthOfTextAtSize(title, 20);
    page.drawText(title, { x: (width - titleWidth) / 2, y, size: 20, font: fontBold, color: black });
    y -= 28;
    const sub = 'Generated: ' + new Date().toLocaleString('en-IN');
    const subWidth = fontReg.widthOfTextAtSize(sub, 9);
    page.drawText(sub, { x: (width - subWidth) / 2, y, size: 9, font: fontReg, color: gray });
    y -= 20;
    drawLine(rgb(0.7, 0.7, 0.7));
    y -= 4;

    drawText('Payment ID: ' + paymentId);
    drawText('Receipt Date: ' + new Date().toLocaleDateString('en-IN'));
    y -= 6;

    drawText('Patient Information', { font: fontBold, size: 12 });
    drawLine();
    drawText('Name:  ' + patientName);
    drawText('MRN:   ' + (payment.patients?.patient_id_number || 'N/A'));
    y -= 6;

    drawText('Charge Details', { font: fontBold, size: 12 });
    drawLine();
    drawText('Service: ' + (payment.description || 'Consultation'));
    if (appointmentDate) drawText('Date:    ' + appointmentDate);
    drawText('Doctor:  ' + (payment.profiles?.full_name || 'N/A'));
    y -= 6;

    drawText('Payment Summary', { font: fontBold, size: 12 });
    drawLine();
    drawText('Amount Charged:  ' + formatAmt(payment.amount_charged));
    drawText('Amount Paid:     ' + formatAmt(payment.amount_paid));
    if (payment.outstanding_balance > 0) {
      drawText('Outstanding:     ' + formatAmt(payment.outstanding_balance), { color: red });
    } else {
      drawText('Outstanding:     Rs. 0.00  (Fully Paid)', { color: green });
    }
    y -= 6;

    const collections: any[] = payment.payment_collections || [];
    if (collections.length > 0) {
      drawText('Collection History', { font: fontBold, size: 12 });
      drawLine();
      collections.forEach((col: any, idx: number) => {
        const colDate = new Date(col.collection_date).toLocaleDateString('en-IN');
        const ref = col.transaction_reference ? '  UTR: ' + col.transaction_reference : '';
        drawText(idx + 1 + '.  ' + colDate + '  -  ' + col.payment_method.toUpperCase() + '  -  ' + formatAmt(col.amount_collected) + ref);
      });
      y -= 6;
    }

    drawLine(rgb(0.7, 0.7, 0.7));
    const footer = 'This is a computer-generated receipt. No signature required.';
    const footerWidth = fontReg.widthOfTextAtSize(footer, 9);
    page.drawText(footer, { x: (width - footerWidth) / 2, y, size: 9, font: fontReg, color: gray });

    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
  } catch (error) {
    console.error('[generatePaymentReceipt] Error:', error);
    return null;
  }
}

/**
 * Generate a treatment details document.
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
      appointments (appointment_date)
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
      prescriptions (medication_name, dosage, frequency, duration_days)
    `
    )
    .eq('patient_id', payment.patient_id)
    .eq('clinic_id', profile.clinic_id)
    .is('deleted_at', null)
    .order('encounter_date', { ascending: false })
    .limit(5);

  const { data: carePlan } = await supabase
    .from('care_plans')
    .select('*')
    .eq('patient_id', payment.patient_id)
    .eq('clinic_id', profile.clinic_id)
    .single();

  try {
    const pdfDoc = await PDFDocument.create();
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontReg = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const page = pdfDoc.addPage([595, 842]);
    const { width, height } = page.getSize();
    const margin = 50;
    let y = height - margin;

    const black = rgb(0, 0, 0);
    const gray = rgb(0.5, 0.5, 0.5);

    const drawText = (
      text: string,
      opts: {
        font?: typeof fontBold;
        size?: number;
        color?: ReturnType<typeof rgb>;
        indent?: number;
      } = {}
    ) => {
      const { font = fontReg, size = 10, color = black, indent = 0 } = opts;
      const maxChars = 90;
      const display = text.length > maxChars ? text.slice(0, maxChars) + '...' : text;
      page.drawText(display, { x: margin + indent, y, size, font, color });
      y -= size + 6;
    };

    const drawLine = (color = rgb(0.8, 0.8, 0.8)) => {
      page.drawLine({
        start: { x: margin, y },
        end: { x: width - margin, y },
        thickness: 0.5,
        color,
      });
      y -= 8;
    };

    const patientName = patientFullName(payment.patients);

    // Header
    const title = 'Treatment Details';
    const titleWidth = fontBold.widthOfTextAtSize(title, 20);
    page.drawText(title, { x: (width - titleWidth) / 2, y, size: 20, font: fontBold, color: black });
    y -= 28;
    const sub = 'Generated: ' + new Date().toLocaleString('en-IN');
    const subWidth = fontReg.widthOfTextAtSize(sub, 9);
    page.drawText(sub, { x: (width - subWidth) / 2, y, size: 9, font: fontReg, color: gray });
    y -= 20;
    drawLine(rgb(0.7, 0.7, 0.7));
    y -= 4;

    drawText('Patient Information', { font: fontBold, size: 12 });
    drawLine();
    drawText('Name:        ' + patientName);
    drawText('MRN:         ' + (payment.patients?.patient_id_number || 'N/A'));
    drawText('Blood Group: ' + (payment.patients?.blood_group || 'N/A'));

    const allergies: string[] = payment.patients?.allergies || [];
    const conditions: string[] = payment.patients?.conditions || [];
    if (allergies.length > 0) drawText('Allergies:   ' + allergies.join(', '));
    if (conditions.length > 0) drawText('Conditions:  ' + conditions.join(', '));
    if (payment.patients?.notes) drawText('Notes:       ' + payment.patients.notes);
    y -= 6;

    if (carePlan) {
      drawText('Current Care Plan', { font: fontBold, size: 12 });
      drawLine();
      if (carePlan.plan_name) drawText('Plan: ' + carePlan.plan_name);
      if (carePlan.medications) drawText('Medications: ' + carePlan.medications.join(', '));
      if (carePlan.follow_up_instructions) drawText('Follow-up: ' + carePlan.follow_up_instructions);
      y -= 6;
    }

    drawText('Recent Encounters', { font: fontBold, size: 12 });
    drawLine();

    if (!encounters || encounters.length === 0) {
      drawText('No encounter history found.', { color: gray });
    } else {
      encounters.forEach((enc: any) => {
        if (y < 100) {
          y = pdfDoc.addPage([595, 842]).getSize().height - margin;
        }
        const encDate = new Date(enc.encounter_date).toLocaleDateString('en-IN');
        drawText(encDate + '  -  ' + (enc.encounter_type || 'Consultation'), { font: fontBold });
        if (enc.chief_complaint) drawText('Chief Complaint: ' + enc.chief_complaint, { indent: 12 });
        if (enc.diagnoses && enc.diagnoses.length > 0) {
          const names = enc.diagnoses.map((d: any) => d.diagnosis_name).filter(Boolean).join(', ');
          if (names) drawText('Diagnoses: ' + names, { indent: 12 });
        }
        if (enc.prescriptions && enc.prescriptions.length > 0) {
          const meds = enc.prescriptions
            .map((p: any) => [p.medication_name, p.dosage, p.frequency].filter(Boolean).join(' '))
            .join(';  ');
          if (meds) drawText('Medications: ' + meds, { indent: 12 });
        }
        if (enc.observation_notes) drawText('Notes: ' + enc.observation_notes, { indent: 12 });
        y -= 4;
      });
    }

    drawLine(rgb(0.7, 0.7, 0.7));
    const footer = 'This is a computer-generated treatment summary.';
    const footerWidth = fontReg.widthOfTextAtSize(footer, 9);
    page.drawText(footer, { x: (width - footerWidth) / 2, y, size: 9, font: fontReg, color: gray });

    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
  } catch (error) {
    console.error('[generateTreatmentDetailsDocument] Error:', error);
    return null;
  }
}