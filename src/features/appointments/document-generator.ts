// src/features/appointments/document-generator.ts
//
// Item 6: prescription PDF generator. Mirrors the teal design system from
// payments/document-generator.ts and pharmacy/document-generator.ts exactly
// (same header/meta-bar/footer conventions, same watermark) so all
// generated documents look consistent regardless of type. Structurally
// simpler than a receipt — no line-item pricing table, just a medicines
// list — since a prescription has no monetary component.
//
// Respects Item 1 (age shown as "—" when date_of_birth is null, never a
// runtime error) and Item 9 (watermark unconditional, no clinic setting
// can disable it).

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getOrCreateProfile } from '@/lib/supabase/profile';
import { calculateAge } from '@/features/patients/types';

function patientFullName(patients: any): string {
  return `${patients?.first_name || ''} ${patients?.last_name || ''}`.trim() || 'Unknown';
}

/**
 * Generate a PDF prescription sheet for an encounter's active prescriptions.
 * Returns a Promise<Buffer>, or null if the encounter can't be found or has
 * no active prescriptions to include.
 */
export async function generatePrescriptionDocument(encounterId: string): Promise<Buffer | null> {
  const supabase = createServerSupabaseClient();
  const profile = await getOrCreateProfile();

  if (!profile) return null;

  const { data: encounter, error: encounterError } = await supabase
    .from('encounters')
    .select(
      `id, patient_id, doctor_id, encounter_date,
       patients (first_name, last_name, patient_id_number, date_of_birth, gender),
       profiles!doctor_id (full_name)`
    )
    .eq('id', encounterId)
    .eq('clinic_id', profile.clinic_id)
    .single();

  if (encounterError || !encounter) {
    console.error('[generatePrescriptionDocument] Encounter not found');
    return null;
  }

  const { data: clinic } = await supabase
    .from('clinics')
    .select('name, address, city, state, postal_code, phone, email, license_number, gst_number')
    .eq('id', profile.clinic_id)
    .single();

  const { data: prescriptionRows, error: rxError } = await supabase
    .from('prescriptions')
    .select('medicine_name, dosage, frequency, duration, instructions')
    .eq('encounter_id', encounterId)
    .eq('clinic_id', profile.clinic_id)
    .eq('status', 'active')
    .order('created_at', { ascending: true });

  if (rxError) {
    console.error('[generatePrescriptionDocument] prescriptions fetch failed', rxError);
    return null;
  }

  const prescriptions = prescriptionRows || [];
  if (prescriptions.length === 0) {
    console.error('[generatePrescriptionDocument] No active prescriptions for this encounter');
    return null;
  }

  try {
    const pdfDoc = await PDFDocument.create();
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontReg = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const page = pdfDoc.addPage([595, 842]);
    const { width, height } = page.getSize();
    const margin = 40;
    const inner = width - margin * 2;

    // ── Design tokens (matches payments/pharmacy document-generator.ts) ──
    const teal = rgb(0.05, 0.52, 0.52);
    const tealDk = rgb(0.03, 0.38, 0.38);
    const tealTint = rgb(0.92, 0.98, 0.98);
    const white = rgb(1, 1, 1);
    const ink = rgb(0.12, 0.12, 0.12);
    const mid = rgb(0.42, 0.42, 0.42);
    const muted = rgb(0.65, 0.65, 0.65);
    const border = rgb(0.86, 0.86, 0.86);
    const surface = rgb(0.96, 0.97, 0.97);

    const patientName = patientFullName(encounter.patients);
    const age = calculateAge((encounter.patients as any)?.date_of_birth ?? null);

    // ── 1. HEADER ──
    const HH = 90;
    page.drawRectangle({ x: 0, y: height - HH, width, height: HH, color: teal });
    page.drawRectangle({ x: 0, y: height - 5, width, height: 5, color: tealDk });

    page.drawText(clinic?.name || 'Clinic', {
      x: margin, y: height - 30, size: 20, font: fontBold, color: white,
    });

    const addrParts = [clinic?.address, clinic?.city, clinic?.state, clinic?.postal_code].filter(Boolean);
    if (addrParts.length > 0) {
      page.drawText(addrParts.join(', '), {
        x: margin, y: height - 48, size: 8.5, font: fontReg, color: rgb(0.82, 0.95, 0.95),
      });
    }

    const contactLine = [clinic?.phone, clinic?.email].filter(Boolean).join('   ·   ');
    if (contactLine) {
      page.drawText(contactLine, {
        x: margin, y: height - 62, size: 8, font: fontReg, color: rgb(0.75, 0.91, 0.91),
      });
    }

    const regLine = [
      clinic?.license_number ? 'Reg: ' + clinic.license_number : null,
      clinic?.gst_number ? 'GST: ' + clinic.gst_number : null,
    ].filter(Boolean).join('   ·   ');
    if (regLine) {
      page.drawText(regLine, {
        x: margin, y: height - 75, size: 7.5, font: fontReg, color: rgb(0.68, 0.87, 0.87),
      });
    }

    const ghost = 'Rx';
    const ghostW = fontBold.widthOfTextAtSize(ghost, 40);
    page.drawText(ghost, {
      x: width - margin - ghostW, y: height - 58, size: 40, font: fontBold, color: white, opacity: 0.10,
    });

    // ── 2. META BAR ──
    const MB = 40;
    const mbY = height - HH - MB;
    page.drawRectangle({ x: 0, y: mbY, width, height: MB, color: tealTint });

    page.drawText('PRESCRIPTION', { x: margin, y: mbY + MB - 14, size: 6.5, font: fontBold, color: teal });
    page.drawText(patientName, { x: margin, y: mbY + 9, size: 12, font: fontBold, color: tealDk });

    const dateStr = new Date(encounter.encounter_date).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'long', year: 'numeric',
    });
    const dateStrW = fontBold.widthOfTextAtSize(dateStr, 10);
    page.drawText('VISIT DATE', {
      x: width - margin - dateStrW, y: mbY + MB - 14, size: 6.5, font: fontBold, color: teal,
    });
    page.drawText(dateStr, {
      x: width - margin - dateStrW, y: mbY + 9, size: 10, font: fontBold, color: ink,
    });

    let y = mbY - 24;

    // ── 3. PATIENT / DOCTOR CARD ──
    const pCardH = 66;
    const pCardY = y - pCardH;

    page.drawRectangle({
      x: margin, y: pCardY, width: inner, height: pCardH,
      color: surface, borderColor: border, borderWidth: 0.5,
    });
    page.drawRectangle({ x: margin, y: pCardY, width: 4, height: pCardH, color: teal });

    page.drawText('PATIENT', { x: margin + 14, y: pCardY + pCardH - 14, size: 6.5, font: fontBold, color: teal });
    page.drawText(patientName, { x: margin + 14, y: pCardY + 40, size: 13, font: fontBold, color: ink });

    const patientMeta = [
      'MRN: ' + ((encounter.patients as any)?.patient_id_number || 'N/A'),
      age !== null ? age + ' yrs' : 'Age: —',
      (encounter.patients as any)?.gender || null,
    ].filter(Boolean).join('   ·   ');
    page.drawText(patientMeta, { x: margin + 14, y: pCardY + 24, size: 9, font: fontReg, color: mid });

    const doctorName = (encounter.profiles as any)?.full_name || 'N/A';
    page.drawText('Prescribed by Dr. ' + doctorName, {
      x: margin + 14, y: pCardY + 10, size: 8, font: fontReg, color: mid,
    });

    y = pCardY - 22;

    // ── 4. MEDICINES ──
    page.drawText('MEDICINES', { x: margin, y, size: 6.5, font: fontBold, color: teal });
    y -= 5;
    page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 0.6, color: teal });
    y -= 14;

    prescriptions.forEach((rx: any, idx: number) => {
      const lineHeader = `${idx + 1}. ${rx.medicine_name}`;
      page.drawText(lineHeader, { x: margin, y, size: 11, font: fontBold, color: ink });
      y -= 16;

      const detailBits = [rx.dosage, rx.frequency, rx.duration].filter(Boolean).join('  ·  ');
      if (detailBits) {
        page.drawText(detailBits, { x: margin + 14, y, size: 9.5, font: fontReg, color: mid });
        y -= 14;
      }

      if (rx.instructions) {
        page.drawText(rx.instructions, { x: margin + 14, y, size: 9, font: fontReg, color: mid });
        y -= 14;
      }

      y -= 8;
      page.drawLine({
        start: { x: margin, y: y + 4 }, end: { x: width - margin, y: y + 4 },
        thickness: 0.3, color: border,
      });
      y -= 6;
    });

    // ── 5. FOOTER ──
    const ftY = 48;
    page.drawLine({
      start: { x: margin, y: ftY + 30 }, end: { x: width - margin, y: ftY + 30 },
      thickness: 0.4, color: border,
    });

    page.drawText(
      'This is a computer-generated prescription and does not require a physical signature.',
      { x: margin, y: ftY + 18, size: 7.5, font: fontReg, color: muted }
    );

    const queryLine = [
      clinic?.phone ? 'Ph: ' + clinic.phone : null,
      clinic?.email || null,
    ].filter(Boolean).join('   ·   ');
    if (queryLine) {
      page.drawText('Queries: ' + queryLine, { x: margin, y: ftY + 6, size: 7.5, font: fontReg, color: muted });
    }

    // Watermark — mandatory, unconditional (Item 9).
    const brand = 'powered by Curakin HealthTech';
    const brandW = fontReg.widthOfTextAtSize(brand, 7);
    page.drawText(brand, {
      x: width - margin - brandW, y: ftY + 6, size: 7, font: fontReg, color: rgb(0.80, 0.80, 0.80),
    });

    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
  } catch (error) {
    console.error('[generatePrescriptionDocument] Error:', error);
    return null;
  }
}