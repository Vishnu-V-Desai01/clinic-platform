// src/app/api/payments/[id]/treatment/route.ts

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getOrCreateProfile } from '@/lib/supabase/profile';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return new NextResponse('Unauthorized', { status: 401 });

  const { id: paymentId } = await params;
  const supabase = createServerSupabaseClient();
  const profile  = await getOrCreateProfile();

  if (!profile || !['doctor', 'staff'].includes(profile.role)) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  const { data: payment, error } = await supabase
    .from('payments')
    .select(
      `*, patients (
        first_name, last_name, patient_id_number,
        gender, blood_group, allergies, conditions, notes
      ),
      appointments (appointment_date),
      profiles!created_by (full_name)`
    )
    .eq('id', paymentId)
    .eq('clinic_id', profile.clinic_id)
    .single();

  if (error || !payment) {
    console.error('[treatment/route] not found:', error);
    return new NextResponse('Payment not found', { status: 404 });
  }

  const { data: clinic } = await supabase
    .from('clinics')
    .select('name, address, city, state, postal_code, phone, email, license_number, gst_number, show_branding_footer')
    .eq('id', profile.clinic_id)
    .single();

  // Fixed column names: condition_name, medicine_name, duration
  const { data: encounters, error: encError } = await supabase
    .from('encounters')
    .select(
      `id, encounter_date, chief_complaint, notes, status,
       diagnoses (condition_name),
       prescriptions (medicine_name, dosage, frequency, duration)`
    )
    .eq('patient_id', payment.patient_id)
    .eq('clinic_id', profile.clinic_id)
    .order('encounter_date', { ascending: false })
    .limit(5);

  if (encError) {
    console.error('[treatment/route] encounters error:', encError);
  }

  try {
    const pdfDoc   = await PDFDocument.create();
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontReg  = await pdfDoc.embedFont(StandardFonts.Helvetica);

    let page = pdfDoc.addPage([595, 842]);
    const W = 595, H = 842;
    const margin = 40;
    const inner  = W - margin * 2;

    // ── Design tokens ──────────────────────────────────────────────
    const teal     = rgb(0.05, 0.52, 0.52);
    const tealDk   = rgb(0.03, 0.38, 0.38);
    const tealTint = rgb(0.92, 0.98, 0.98);
    const white    = rgb(1, 1, 1);
    const ink      = rgb(0.12, 0.12, 0.12);
    const mid      = rgb(0.42, 0.42, 0.42);
    const muted    = rgb(0.65, 0.65, 0.65);
    const border   = rgb(0.86, 0.86, 0.86);
    const surface  = rgb(0.96, 0.97, 0.97);
    const rose     = rgb(0.72, 0.10, 0.10);

    const patientName =
      ((payment.patients?.first_name || '') + ' ' +
       (payment.patients?.last_name  || '')).trim() || 'Unknown';

    let y = H - margin;

    const checkPage = (needed: number) => {
      if (y < needed + 60) {
        page = pdfDoc.addPage([W, H]);
        y = H - margin;
      }
    };

    const drawT = (
      text: string,
      opts: {
        font?:   typeof fontBold;
        size?:   number;
        color?:  ReturnType<typeof rgb>;
        indent?: number;
        align?:  'center';
      } = {}
    ) => {
      const { font = fontReg, size = 10, color = ink, indent = 0, align } = opts;
      const maxChars = 88 - Math.floor(indent / 4);
      const display  = text.length > maxChars ? text.slice(0, maxChars) + '...' : text;
      let x = margin + indent;
      if (align === 'center') {
        const w = font.widthOfTextAtSize(display, size);
        x = (W - w) / 2;
      }
      page.drawText(display, { x, y, size, font, color });
      y -= size + 5;
    };

    const drawL = (c = border, t = 0.5) => {
      page.drawLine({
        start: { x: margin,     y },
        end:   { x: W - margin, y },
        thickness: t, color: c,
      });
      y -= 8;
    };

    // ── 1. HEADER ─────────────────────────────────────────────────
    const HH = 90;
    page.drawRectangle({ x: 0, y: H - HH, width: W, height: HH, color: teal });
    page.drawRectangle({ x: 0, y: H - 5,  width: W, height: 5,  color: tealDk });

    page.drawText(clinic?.name || 'Clinic', {
      x: margin, y: H - 30, size: 20, font: fontBold, color: white,
    });

    const addrParts = [
      clinic?.address, clinic?.city, clinic?.state, clinic?.postal_code,
    ].filter(Boolean);
    if (addrParts.length > 0) {
      page.drawText(addrParts.join(', '), {
        x: margin, y: H - 48, size: 8.5, font: fontReg,
        color: rgb(0.82, 0.95, 0.95),
      });
    }

    const contactLine = [clinic?.phone, clinic?.email].filter(Boolean).join('   ·   ');
    if (contactLine) {
      page.drawText(contactLine, {
        x: margin, y: H - 62, size: 8, font: fontReg,
        color: rgb(0.75, 0.91, 0.91),
      });
    }

    const regLine = [
      clinic?.license_number ? 'Reg: ' + clinic.license_number : null,
      clinic?.gst_number     ? 'GST: ' + clinic.gst_number     : null,
    ].filter(Boolean).join('   ·   ');
    if (regLine) {
      page.drawText(regLine, {
        x: margin, y: H - 75, size: 7.5, font: fontReg,
        color: rgb(0.68, 0.87, 0.87),
      });
    }

    const ghost  = 'TREATMENT';
    const ghostW = fontBold.widthOfTextAtSize(ghost, 32);
    page.drawText(ghost, {
      x: W - margin - ghostW, y: H - 56,
      size: 32, font: fontBold, color: white, opacity: 0.10,
    });

    // ── 2. META BAR ───────────────────────────────────────────────
    const MB  = 40;
    const mbY = H - HH - MB;
    page.drawRectangle({ x: 0, y: mbY, width: W, height: MB, color: tealTint });

    page.drawText('TREATMENT SUMMARY', {
      x: margin, y: mbY + MB - 14, size: 6.5, font: fontBold, color: teal,
    });
    page.drawText(patientName, {
      x: margin, y: mbY + 9, size: 12, font: fontBold, color: tealDk,
    });

    const dateStr  = new Date().toLocaleDateString('en-IN', {
      day: 'numeric', month: 'long', year: 'numeric',
    });
    const dateStrW = fontBold.widthOfTextAtSize(dateStr, 10);
    page.drawText('GENERATED ON', {
      x: W - margin - dateStrW, y: mbY + MB - 14,
      size: 6.5, font: fontBold, color: teal,
    });
    page.drawText(dateStr, {
      x: W - margin - dateStrW, y: mbY + 9,
      size: 10, font: fontBold, color: ink,
    });

    y = mbY - 22;

    // ── 3. PATIENT CARD ───────────────────────────────────────────
    const pCardH = 66;
    const pCardY = y - pCardH;

    page.drawRectangle({
      x: margin, y: pCardY, width: inner, height: pCardH,
      color: surface, borderColor: border, borderWidth: 0.5,
    });
    page.drawRectangle({ x: margin, y: pCardY, width: 4, height: pCardH, color: teal });

    page.drawText('PATIENT', {
      x: margin + 14, y: pCardY + pCardH - 14,
      size: 6.5, font: fontBold, color: teal,
    });
    page.drawText(patientName, {
      x: margin + 14, y: pCardY + 40,
      size: 13, font: fontBold, color: ink,
    });
    page.drawText('MRN: ' + (payment.patients?.patient_id_number || 'N/A'), {
      x: margin + 14, y: pCardY + 24,
      size: 9, font: fontReg, color: mid,
    });

    if (payment.patients?.blood_group) {
      const bgX = W / 2 + 20;
      page.drawText('BLOOD GROUP', {
        x: bgX, y: pCardY + pCardH - 14,
        size: 6.5, font: fontBold, color: teal,
      });
      page.drawText(payment.patients.blood_group, {
        x: bgX, y: pCardY + 30,
        size: 22, font: fontBold, color: tealDk,
      });
    }

    const apptDate = payment.appointments?.appointment_date
      ? new Date(payment.appointments.appointment_date).toLocaleDateString('en-IN')
      : new Date(payment.created_at).toLocaleDateString('en-IN');

    page.drawText(
      'Visit: ' + apptDate + '   ·   Dr. ' + (payment.profiles?.full_name || 'N/A'),
      { x: margin + 14, y: pCardY + 10, size: 8, font: fontReg, color: mid }
    );

    y = pCardY - 22;

    // ── 4. MEDICAL PROFILE ────────────────────────────────────────
    const allergies:  string[] = payment.patients?.allergies  || [];
    const conditions: string[] = payment.patients?.conditions || [];
    const pNotes = payment.patients?.notes;

    if (allergies.length > 0 || conditions.length > 0 || pNotes) {
      checkPage(60);
      drawT('MEDICAL PROFILE', { font: fontBold, size: 6.5, color: teal });
      y -= 3;
      drawL(teal, 0.6);
      if (conditions.length > 0)
        drawT('Conditions:  ' + conditions.join(', '), { size: 9 });
      if (allergies.length > 0)
        drawT('Allergies:   ' + allergies.join(', '), { size: 9, color: rose });
      if (pNotes)
        drawT('Notes:       ' + pNotes, { size: 9, color: mid });
      y -= 14;
    }

    // ── 5. ENCOUNTER HISTORY ──────────────────────────────────────
    checkPage(80);
    drawT('ENCOUNTER HISTORY', { font: fontBold, size: 6.5, color: teal });
    y -= 3;
    drawL(teal, 0.6);

    if (!encounters || encounters.length === 0) {
      drawT('No encounter history found.', { size: 9, color: muted });
    } else {
      encounters.forEach((enc: any, idx: number) => {
        checkPage(50);

        const encDate  = new Date(enc.encounter_date).toLocaleDateString('en-IN');
        const encLabel = enc.status
          ? enc.status.charAt(0).toUpperCase() + enc.status.slice(1)
          : 'Consultation';

        // Encounter header row
        const ehH = 20;
        const ehY = y - ehH;
        page.drawRectangle({
          x: margin, y: ehY, width: inner, height: ehH,
          color: idx % 2 === 0 ? rgb(0.92, 0.98, 0.98) : rgb(0.95, 0.95, 0.95),
        });
        page.drawText(encDate + '   —   ' + encLabel, {
          x: margin + 10, y: ehY + 6,
          size: 10, font: fontBold, color: tealDk,
        });

        // Advance y below header before drawT calls
        y = ehY - 6;

        if (enc.chief_complaint) {
          drawT('Chief Complaint: ' + enc.chief_complaint, { size: 9, indent: 10 });
        }

        // Fixed: condition_name (not diagnosis_name)
        const diagNames = (enc.diagnoses || [])
          .map((d: any) => d.condition_name)
          .filter(Boolean)
          .join(', ');
        if (diagNames) {
          drawT('Diagnoses: ' + diagNames, { size: 9, indent: 10 });
        }

        // Fixed: medicine_name + duration (not medication_name + duration_days)
        if (enc.prescriptions && enc.prescriptions.length > 0) {
          drawT('Medications:', { size: 8.5, font: fontBold, color: mid, indent: 10 });
          enc.prescriptions.forEach((p: any) => {
            const medStr = [
              p.medicine_name,
              p.dosage,
              p.frequency,
              p.duration ? p.duration + ' days' : null,
            ].filter(Boolean).join(' · ');
            drawT(medStr, { size: 8.5, color: ink, indent: 20 });
          });
        }

        // Fixed: enc.notes (not observation_notes)
        if (enc.notes) {
          drawT('Notes: ' + enc.notes, { size: 9, color: mid, indent: 10 });
        }

        y -= 4;
        page.drawLine({
          start: { x: margin,     y },
          end:   { x: W - margin, y },
          thickness: 0.3, color: border,
        });
        y -= 10;
      });
    }

    // ── 6. FOOTER ─────────────────────────────────────────────────
    y -= 10;
    drawL(border, 0.4);
    drawT(
      'This is a computer-generated treatment summary for reference purposes only.',
      { size: 7.5, color: muted }
    );
    if (payment.receipt_number) {
      drawT('Receipt No: ' + payment.receipt_number, { size: 7.5, color: muted });
    }
    if (clinic?.show_branding_footer) {
      const brand  = 'Powered by CURA HealthTech';
      const brandW = fontReg.widthOfTextAtSize(brand, 7);
      page.drawText(brand, {
        x: W - margin - brandW, y,
        size: 7, font: fontReg, color: rgb(0.80, 0.80, 0.80),
      });
    }

    const pdfBytes = await pdfDoc.save();
    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition':
          'attachment; filename="treatment-' + paymentId.slice(0, 8) + '.pdf"',
        'Content-Length': pdfBytes.length.toString(),
      },
    });
  } catch (err) {
    console.error('[treatment/route] PDF error:', err);
    return new NextResponse('Failed to generate PDF', { status: 500 });
  }
}