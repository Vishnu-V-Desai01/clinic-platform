// src/features/payments/document-generator.ts
//
// Item 9 follow-up: this file previously produced a plain, unstyled PDF
// completely different from the teal-designed one used by the in-app
// "Download Receipt" button (src/app/api/payments/[id]/receipt/route.ts
// and .../treatment/route.ts). Both paths now render the same design, so
// a patient sees an identical document whether they get it via WhatsApp
// (this file, through generateAndStorePaymentDocuments) or a staff
// download click (the route files). The watermark fix from Item 9 — the
// disable-toggle was removed and the watermark is now unconditional — is
// applied here too; this file never received that fix originally because
// an earlier audit missed that document-storage.ts imports from here via
// a relative path, not the absolute path that audit's search used.
//
// generateTreatmentDetailsDocument also fixes real column-name bugs that
// were already caught and fixed in treatment/route.ts but never carried
// over here: diagnosis_name -> condition_name, medication_name/
// duration_days -> medicine_name/duration, observation_notes -> notes.
// The old "Current Care Plan" section is dropped entirely — it read
// care_plans as flat columns (plan_name, medications, follow_up_instructions)
// that don't match the real JSONB schema, and treatment/route.ts (the
// reference design this file now matches) never had that section either.

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
      `*, patients (first_name, last_name, patient_id_number),
       appointments (appointment_date),
       profiles!created_by (full_name),
       payment_collections (
         id, amount_collected, collection_date,
         payment_method, transaction_reference
       )`
    )
    .eq('id', paymentId)
    .eq('clinic_id', profile.clinic_id)
    .single();

  if (paymentError || !payment) {
    console.error('[generatePaymentReceipt] Payment not found');
    return null;
  }

  const { data: clinic } = await supabase
    .from('clinics')
    .select('name, address, city, state, postal_code, phone, email, license_number, gst_number, hfr_id')
    .eq('id', profile.clinic_id)
    .single();

  const { data: lineItemsRaw } = await supabase
    .from('payment_line_items')
    .select('*')
    .eq('payment_id', paymentId)
    .eq('clinic_id', profile.clinic_id)
    .order('sort_order', { ascending: true });

  const lineItems: any[] = lineItemsRaw || [];
  const hasLineItems = lineItems.length > 0;

  try {
    const pdfDoc = await PDFDocument.create();
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontReg = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const page = pdfDoc.addPage([595, 842]);
    const { width, height } = page.getSize();
    const margin = 40;
    const inner = width - margin * 2;

    // ── Design tokens (matches app/api/payments/[id]/receipt/route.ts) ──
    const teal = rgb(0.05, 0.52, 0.52);
    const tealDk = rgb(0.03, 0.38, 0.38);
    const tealTint = rgb(0.92, 0.98, 0.98);
    const white = rgb(1, 1, 1);
    const ink = rgb(0.12, 0.12, 0.12);
    const mid = rgb(0.42, 0.42, 0.42);
    const muted = rgb(0.65, 0.65, 0.65);
    const border = rgb(0.86, 0.86, 0.86);
    const surface = rgb(0.96, 0.97, 0.97);
    const emerald = rgb(0.07, 0.52, 0.27);
    const rose = rgb(0.72, 0.10, 0.10);

    const fmt = (v: number) =>
      'Rs. ' + Number(v).toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

    const METHOD: Record<string, string> = {
      cash: 'Cash', card: 'Card', upi: 'UPI',
      bank_transfer: 'Bank Transfer', check: 'Cheque', other: 'Other',
    };

    const patientName = patientFullName(payment.patients);
    const collections: any[] = payment.payment_collections || [];

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

    const ghost = 'RECEIPT';
    const ghostW = fontBold.widthOfTextAtSize(ghost, 38);
    page.drawText(ghost, {
      x: width - margin - ghostW, y: height - 56,
      size: 38, font: fontBold, color: white, opacity: 0.10,
    });

    // ── 2. META BAR ──
    const MB = 40;
    const mbY = height - HH - MB;
    page.drawRectangle({ x: 0, y: mbY, width, height: MB, color: tealTint });

    if (payment.receipt_number) {
      page.drawText('RECEIPT NO.', {
        x: margin, y: mbY + MB - 14, size: 6.5, font: fontBold, color: teal,
      });
      page.drawText(payment.receipt_number, {
        x: margin, y: mbY + 9, size: 12, font: fontBold, color: tealDk,
      });
    }

    const pidTxt = 'ID: ' + paymentId.slice(0, 8).toUpperCase() + '...';
    const pidW = fontReg.widthOfTextAtSize(pidTxt, 7.5);
    page.drawText(pidTxt, {
      x: (width - pidW) / 2, y: mbY + 16, size: 7.5, font: fontReg, color: mid,
    });

    const dateStr = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
    const dateStrW = fontBold.widthOfTextAtSize(dateStr, 10);
    page.drawText('DATE', {
      x: width - margin - dateStrW, y: mbY + MB - 14, size: 6.5, font: fontBold, color: teal,
    });
    page.drawText(dateStr, {
      x: width - margin - dateStrW, y: mbY + 9, size: 10, font: fontBold, color: ink,
    });

    let y = mbY - 24;

    // ── 3. BILLED TO / SERVICE ──
    const c1 = margin;
    const c2 = width / 2 + 8;
    const cw = width / 2 - margin - 8;

    page.drawText('BILLED TO', { x: c1, y, size: 6.5, font: fontBold, color: teal });
    page.drawText('SERVICE', { x: c2, y, size: 6.5, font: fontBold, color: teal });
    y -= 5;

    page.drawLine({ start: { x: c1, y }, end: { x: c1 + cw, y }, thickness: 0.6, color: teal });
    page.drawLine({ start: { x: c2, y }, end: { x: c2 + cw, y }, thickness: 0.6, color: teal });
    y -= 14;

    const svcLabel = hasLineItems
      ? lineItems.length + ' service' + (lineItems.length !== 1 ? 's' : '')
      : (payment.description || 'Consultation').slice(0, 26);

    page.drawText(patientName, { x: c1, y, size: 12, font: fontBold, color: ink });
    page.drawText(svcLabel, { x: c2, y, size: 12, font: fontBold, color: ink });
    y -= 15;

    page.drawText('MRN: ' + (payment.patients?.patient_id_number || 'N/A'), {
      x: c1, y, size: 9, font: fontReg, color: mid,
    });

    const apptDate = payment.appointments?.appointment_date
      ? new Date(payment.appointments.appointment_date).toLocaleDateString('en-IN')
      : null;
    if (apptDate) {
      page.drawText('Date: ' + apptDate, { x: c2, y, size: 9, font: fontReg, color: mid });
    }
    y -= 13;

    const doctorName = payment.profiles?.full_name || 'N/A';
    page.drawText(
      'Dr. ' + (doctorName.length > 26 ? doctorName.slice(0, 26) + '...' : doctorName),
      { x: c2, y, size: 9, font: fontReg, color: mid }
    );
    y -= 22;

    // ── 4. ITEMISED BILL TABLE ──
    if (hasLineItems) {
      page.drawText('ITEMISED BILL', { x: margin, y, size: 6.5, font: fontBold, color: teal });
      y -= 5;
      page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 0.6, color: teal });
      y -= 2;

      const rightEdge = margin + inner;
      const qtyRight = margin + inner * 0.52;
      const upRight = margin + inner * 0.77;

      const thH = 18;
      const thY = y - thH;
      page.drawRectangle({ x: margin, y: thY, width: inner, height: thH, color: rgb(0.91, 0.91, 0.91) });

      page.drawText('DESCRIPTION', { x: margin + 10, y: thY + 5, size: 7, font: fontBold, color: mid });

      const qtyHdr = 'QTY';
      const qtyHdrW = fontBold.widthOfTextAtSize(qtyHdr, 7);
      page.drawText(qtyHdr, { x: qtyRight - qtyHdrW, y: thY + 5, size: 7, font: fontBold, color: mid });

      const upHdr = 'UNIT PRICE';
      const upHdrW = fontBold.widthOfTextAtSize(upHdr, 7);
      page.drawText(upHdr, { x: upRight - upHdrW, y: thY + 5, size: 7, font: fontBold, color: mid });

      const totHdr = 'TOTAL';
      const totHdrW = fontBold.widthOfTextAtSize(totHdr, 7);
      page.drawText(totHdr, { x: rightEdge - 10 - totHdrW, y: thY + 5, size: 7, font: fontBold, color: mid });

      y = thY;

      lineItems.forEach((item: any, idx: number) => {
        const rH = 22;
        const rY = y - rH;
        const total = Number(item.total_price || 0);
        const up = Number(item.unit_price || 0);

        if (idx % 2 === 1) {
          page.drawRectangle({ x: margin, y: rY, width: inner, height: rH, color: rgb(0.97, 0.97, 0.97) });
        }

        const descMax = 38;
        const descDisp = item.description.length > descMax
          ? item.description.slice(0, descMax) + '...'
          : item.description;
        page.drawText(descDisp, { x: margin + 10, y: rY + 7, size: 9, font: fontReg, color: ink });

        const qtyTxt = String(item.quantity);
        const qtyW = fontReg.widthOfTextAtSize(qtyTxt, 9);
        page.drawText(qtyTxt, { x: qtyRight - qtyW, y: rY + 7, size: 9, font: fontReg, color: mid });

        const upTxt = fmt(up);
        const upW = fontReg.widthOfTextAtSize(upTxt, 9);
        page.drawText(upTxt, { x: upRight - upW, y: rY + 7, size: 9, font: fontReg, color: mid });

        const totTxt = fmt(total);
        const totW = fontBold.widthOfTextAtSize(totTxt, 9);
        page.drawText(totTxt, { x: rightEdge - 10 - totW, y: rY + 7, size: 9, font: fontBold, color: ink });

        page.drawLine({ start: { x: margin, y: rY }, end: { x: rightEdge, y: rY }, thickness: 0.3, color: border });

        y = rY;
      });

      if (lineItems.length > 1) {
        const gtH = 20;
        const gtY = y - gtH;
        page.drawRectangle({ x: margin, y: gtY, width: inner, height: gtH, color: rgb(0.92, 0.98, 0.98) });

        page.drawText('GRAND TOTAL', { x: margin + 10, y: gtY + 6, size: 8, font: fontBold, color: tealDk });

        const gtAmt = fmt(payment.amount_charged);
        const gtAmtW = fontBold.widthOfTextAtSize(gtAmt, 11);
        page.drawText(gtAmt, {
          x: rightEdge - 10 - gtAmtW, y: gtY + 5, size: 11, font: fontBold, color: tealDk,
        });

        y = gtY;
      }

      y -= 20;
    } else {
      y -= 8;
    }

    // ── 5. AMOUNT SUMMARY BOX ──
    const boxH = 80;
    const boxY = y - boxH;
    const t3 = inner / 3;

    page.drawRectangle({
      x: margin, y: boxY, width: inner, height: boxH,
      color: surface, borderColor: border, borderWidth: 0.5,
    });
    page.drawRectangle({ x: margin, y: boxY, width: 4, height: boxH, color: teal });

    page.drawLine({
      start: { x: margin + t3, y: boxY + 10 }, end: { x: margin + t3, y: boxY + boxH - 10 },
      thickness: 0.4, color: border,
    });
    page.drawLine({
      start: { x: margin + t3 * 2, y: boxY + 10 }, end: { x: margin + t3 * 2, y: boxY + boxH - 10 },
      thickness: 0.4, color: border,
    });

    page.drawText('AMOUNT CHARGED', { x: margin + 18, y: boxY + 60, size: 6.5, font: fontBold, color: mid });
    page.drawText(fmt(payment.amount_charged), { x: margin + 18, y: boxY + 38, size: 15, font: fontBold, color: ink });

    page.drawText('AMOUNT PAID', { x: margin + t3 + 18, y: boxY + 60, size: 6.5, font: fontBold, color: mid });
    page.drawText(fmt(payment.amount_paid), {
      x: margin + t3 + 18, y: boxY + 38, size: 15, font: fontBold, color: emerald,
    });

    page.drawText('OUTSTANDING', { x: margin + t3 * 2 + 18, y: boxY + 60, size: 6.5, font: fontBold, color: mid });
    const outAmt = payment.outstanding_balance;
    const outText = outAmt > 0 ? fmt(outAmt) : 'Nil';
    const outSize = outAmt > 0 ? 15 : 18;
    page.drawText(outText, {
      x: margin + t3 * 2 + 18, y: boxY + 38, size: outSize, font: fontBold,
      color: outAmt > 0 ? rose : emerald,
    });

    const statusLabel =
      payment.payment_status === 'paid' ? 'PAID IN FULL'
      : payment.payment_status === 'partial' ? 'PARTIALLY PAID'
      : 'UNPAID';
    const statusBg =
      payment.payment_status === 'paid' ? emerald
      : payment.payment_status === 'partial' ? rgb(0.25, 0.45, 0.87)
      : rose;

    const slW = fontBold.widthOfTextAtSize(statusLabel, 7.5);
    const badgeW = slW + 18;
    const badgeH = 17;
    const badgeX = margin + inner - badgeW - 12;
    const badgeY = boxY + 10;
    page.drawRectangle({ x: badgeX, y: badgeY, width: badgeW, height: badgeH, color: statusBg });
    page.drawText(statusLabel, { x: badgeX + 9, y: badgeY + 5, size: 7.5, font: fontBold, color: white });

    y = boxY - 24;

    // ── 6. COLLECTION HISTORY TABLE ──
    if (collections.length > 0) {
      page.drawText('COLLECTION HISTORY', { x: margin, y, size: 6.5, font: fontBold, color: teal });
      y -= 5;
      page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 0.6, color: teal });
      y -= 2;

      const thH = 18;
      const thY = y - thH;
      page.drawRectangle({ x: margin, y: thY, width: inner, height: thH, color: rgb(0.90, 0.90, 0.90) });

      const tc1 = margin + 10;
      const tc2 = margin + 115;
      const tc3 = margin + 235;
      const tc4 = margin + 375;

      page.drawText('DATE', { x: tc1, y: thY + 5, size: 7, font: fontBold, color: mid });
      page.drawText('METHOD', { x: tc2, y: thY + 5, size: 7, font: fontBold, color: mid });
      page.drawText('REFERENCE / UTR', { x: tc3, y: thY + 5, size: 7, font: fontBold, color: mid });
      page.drawText('AMOUNT', { x: tc4, y: thY + 5, size: 7, font: fontBold, color: mid });

      y = thY;

      collections.forEach((col: any, idx: number) => {
        const rH = 22;
        const rY = y - rH;

        if (idx % 2 === 1) {
          page.drawRectangle({ x: margin, y: rY, width: inner, height: rH, color: rgb(0.97, 0.97, 0.97) });
        }

        const colDate = new Date(col.collection_date).toLocaleDateString('en-IN');
        const method = METHOD[col.payment_method as string] || col.payment_method;
        const ref = col.transaction_reference || '\u2014';
        const refDisp = ref.length > 22 ? ref.slice(0, 22) + '...' : ref;

        page.drawText(colDate, { x: tc1, y: rY + 7, size: 9, font: fontReg, color: ink });
        page.drawText(method, { x: tc2, y: rY + 7, size: 9, font: fontReg, color: ink });
        page.drawText(refDisp, { x: tc3, y: rY + 7, size: 9, font: fontReg, color: mid });
        page.drawText(fmt(col.amount_collected), { x: tc4, y: rY + 7, size: 9, font: fontBold, color: ink });

        page.drawLine({ start: { x: margin, y: rY }, end: { x: margin + inner, y: rY }, thickness: 0.3, color: border });

        y = rY;
      });

      y -= 8;
    }

    // ── 7. FOOTER ──
    const ftY = 48;
    page.drawLine({
      start: { x: margin, y: ftY + 30 }, end: { x: width - margin, y: ftY + 30 },
      thickness: 0.4, color: border,
    });

    page.drawText(
      'This is a computer-generated receipt and does not require a physical signature.',
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

  if (paymentError || !payment) {
    console.error('[generateTreatmentDetailsDocument] Payment not found');
    return null;
  }

  const { data: clinic } = await supabase
    .from('clinics')
    .select('name, address, city, state, postal_code, phone, email, license_number, gst_number')
    .eq('id', profile.clinic_id)
    .single();

  // Correct column names: condition_name (not diagnosis_name),
  // medicine_name + duration (not medication_name + duration_days).
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
    console.error('[generateTreatmentDetailsDocument] encounters error:', encError);
  }

  try {
    const pdfDoc = await PDFDocument.create();
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontReg = await pdfDoc.embedFont(StandardFonts.Helvetica);

    let page = pdfDoc.addPage([595, 842]);
    const W = 595, H = 842;
    const margin = 40;
    const inner = W - margin * 2;

    const teal = rgb(0.05, 0.52, 0.52);
    const tealDk = rgb(0.03, 0.38, 0.38);
    const tealTint = rgb(0.92, 0.98, 0.98);
    const white = rgb(1, 1, 1);
    const ink = rgb(0.12, 0.12, 0.12);
    const mid = rgb(0.42, 0.42, 0.42);
    const muted = rgb(0.65, 0.65, 0.65);
    const border = rgb(0.86, 0.86, 0.86);
    const surface = rgb(0.96, 0.97, 0.97);
    const rose = rgb(0.72, 0.10, 0.10);

    const patientName = patientFullName(payment.patients);

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
        font?: typeof fontBold;
        size?: number;
        color?: ReturnType<typeof rgb>;
        indent?: number;
        align?: 'center';
      } = {}
    ) => {
      const { font = fontReg, size = 10, color = ink, indent = 0, align } = opts;
      const maxChars = 88 - Math.floor(indent / 4);
      const display = text.length > maxChars ? text.slice(0, maxChars) + '...' : text;
      let x = margin + indent;
      if (align === 'center') {
        const w = font.widthOfTextAtSize(display, size);
        x = (W - w) / 2;
      }
      page.drawText(display, { x, y, size, font, color });
      y -= size + 5;
    };

    const drawL = (c = border, t = 0.5) => {
      page.drawLine({ start: { x: margin, y }, end: { x: W - margin, y }, thickness: t, color: c });
      y -= 8;
    };

    // ── 1. HEADER ──
    const HH = 90;
    page.drawRectangle({ x: 0, y: H - HH, width: W, height: HH, color: teal });
    page.drawRectangle({ x: 0, y: H - 5, width: W, height: 5, color: tealDk });

    page.drawText(clinic?.name || 'Clinic', {
      x: margin, y: H - 30, size: 20, font: fontBold, color: white,
    });

    const addrParts = [clinic?.address, clinic?.city, clinic?.state, clinic?.postal_code].filter(Boolean);
    if (addrParts.length > 0) {
      page.drawText(addrParts.join(', '), {
        x: margin, y: H - 48, size: 8.5, font: fontReg, color: rgb(0.82, 0.95, 0.95),
      });
    }

    const contactLine = [clinic?.phone, clinic?.email].filter(Boolean).join('   ·   ');
    if (contactLine) {
      page.drawText(contactLine, {
        x: margin, y: H - 62, size: 8, font: fontReg, color: rgb(0.75, 0.91, 0.91),
      });
    }

    const regLine = [
      clinic?.license_number ? 'Reg: ' + clinic.license_number : null,
      clinic?.gst_number ? 'GST: ' + clinic.gst_number : null,
    ].filter(Boolean).join('   ·   ');
    if (regLine) {
      page.drawText(regLine, {
        x: margin, y: H - 75, size: 7.5, font: fontReg, color: rgb(0.68, 0.87, 0.87),
      });
    }

    const ghost = 'TREATMENT';
    const ghostW = fontBold.widthOfTextAtSize(ghost, 32);
    page.drawText(ghost, {
      x: W - margin - ghostW, y: H - 56, size: 32, font: fontBold, color: white, opacity: 0.10,
    });

    // ── 2. META BAR ──
    const MB = 40;
    const mbY = H - HH - MB;
    page.drawRectangle({ x: 0, y: mbY, width: W, height: MB, color: tealTint });

    page.drawText('TREATMENT SUMMARY', { x: margin, y: mbY + MB - 14, size: 6.5, font: fontBold, color: teal });
    page.drawText(patientName, { x: margin, y: mbY + 9, size: 12, font: fontBold, color: tealDk });

    const dateStr = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
    const dateStrW = fontBold.widthOfTextAtSize(dateStr, 10);
    page.drawText('GENERATED ON', {
      x: W - margin - dateStrW, y: mbY + MB - 14, size: 6.5, font: fontBold, color: teal,
    });
    page.drawText(dateStr, {
      x: W - margin - dateStrW, y: mbY + 9, size: 10, font: fontBold, color: ink,
    });

    y = mbY - 22;

    // ── 3. PATIENT CARD ──
    const pCardH = 66;
    const pCardY = y - pCardH;

    page.drawRectangle({
      x: margin, y: pCardY, width: inner, height: pCardH,
      color: surface, borderColor: border, borderWidth: 0.5,
    });
    page.drawRectangle({ x: margin, y: pCardY, width: 4, height: pCardH, color: teal });

    page.drawText('PATIENT', { x: margin + 14, y: pCardY + pCardH - 14, size: 6.5, font: fontBold, color: teal });
    page.drawText(patientName, { x: margin + 14, y: pCardY + 40, size: 13, font: fontBold, color: ink });
    page.drawText('MRN: ' + (payment.patients?.patient_id_number || 'N/A'), {
      x: margin + 14, y: pCardY + 24, size: 9, font: fontReg, color: mid,
    });

    if (payment.patients?.blood_group) {
      const bgX = W / 2 + 20;
      page.drawText('BLOOD GROUP', { x: bgX, y: pCardY + pCardH - 14, size: 6.5, font: fontBold, color: teal });
      page.drawText(payment.patients.blood_group, {
        x: bgX, y: pCardY + 30, size: 22, font: fontBold, color: tealDk,
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

    // ── 4. MEDICAL PROFILE ──
    const allergies: string[] = payment.patients?.allergies || [];
    const conditions: string[] = payment.patients?.conditions || [];
    const pNotes = payment.patients?.notes;

    if (allergies.length > 0 || conditions.length > 0 || pNotes) {
      checkPage(60);
      drawT('MEDICAL PROFILE', { font: fontBold, size: 6.5, color: teal });
      y -= 3;
      drawL(teal, 0.6);
      if (conditions.length > 0) drawT('Conditions:  ' + conditions.join(', '), { size: 9 });
      if (allergies.length > 0) drawT('Allergies:   ' + allergies.join(', '), { size: 9, color: rose });
      if (pNotes) drawT('Notes:       ' + pNotes, { size: 9, color: mid });
      y -= 14;
    }

    // ── 5. ENCOUNTER HISTORY ──
    checkPage(80);
    drawT('ENCOUNTER HISTORY', { font: fontBold, size: 6.5, color: teal });
    y -= 3;
    drawL(teal, 0.6);

    if (!encounters || encounters.length === 0) {
      drawT('No encounter history found.', { size: 9, color: muted });
    } else {
      encounters.forEach((enc: any, idx: number) => {
        checkPage(50);

        const encDate = new Date(enc.encounter_date).toLocaleDateString('en-IN');
        const encLabel = enc.status
          ? enc.status.charAt(0).toUpperCase() + enc.status.slice(1)
          : 'Consultation';

        const ehH = 20;
        const ehY = y - ehH;
        page.drawRectangle({
          x: margin, y: ehY, width: inner, height: ehH,
          color: idx % 2 === 0 ? rgb(0.92, 0.98, 0.98) : rgb(0.95, 0.95, 0.95),
        });
        page.drawText(encDate + '   —   ' + encLabel, {
          x: margin + 10, y: ehY + 6, size: 10, font: fontBold, color: tealDk,
        });

        y = ehY - 6;

        if (enc.chief_complaint) {
          drawT('Chief Complaint: ' + enc.chief_complaint, { size: 9, indent: 10 });
        }

        const diagNames = (enc.diagnoses || [])
          .map((d: any) => d.condition_name)
          .filter(Boolean)
          .join(', ');
        if (diagNames) {
          drawT('Diagnoses: ' + diagNames, { size: 9, indent: 10 });
        }

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

        if (enc.notes) {
          drawT('Notes: ' + enc.notes, { size: 9, color: mid, indent: 10 });
        }

        y -= 4;
        page.drawLine({
          start: { x: margin, y }, end: { x: W - margin, y }, thickness: 0.3, color: border,
        });
        y -= 10;
      });
    }

    // ── 6. FOOTER ──
    y -= 10;
    drawL(border, 0.4);
    drawT(
      'This is a computer-generated treatment summary for reference purposes only.',
      { size: 7.5, color: muted }
    );
    if (payment.receipt_number) {
      drawT('Receipt No: ' + payment.receipt_number, { size: 7.5, color: muted });
    }

    // Watermark — mandatory, unconditional (Item 9).
    const brand = 'powered by Curakin HealthTech';
    const brandW = fontReg.widthOfTextAtSize(brand, 7);
    page.drawText(brand, {
      x: W - margin - brandW, y, size: 7, font: fontReg, color: rgb(0.80, 0.80, 0.80),
    });

    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
  } catch (error) {
    console.error('[generateTreatmentDetailsDocument] Error:', error);
    return null;
  }
}