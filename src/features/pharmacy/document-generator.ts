// src/features/pharmacy/document-generator.ts
//
// Medicine receipt PDF generation. Deliberately a separate function/file
// from src/features/payments/document-generator.ts rather than extending
// generatePaymentReceipt() — a medicine receipt's structure (per-drug line
// items, batch/expiry-adjacent info) doesn't fit the consultation receipt's
// layout, and keeping them separate means neither generator has to grow
// conditional branches for the other's shape.
//
// Visual style now matches payments/document-generator.ts and
// app/api/payments/[id]/receipt/route.ts exactly (same teal header, meta
// bar, itemised bill table, amount summary box, footer) — Item 9 originally
// only added the watermark line to this file's old plain layout without
// redesigning it, so a medicine receipt still looked visually different
// from a consultation receipt. This brings all three receipt-generating
// paths to one consistent design.

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getOrCreateProfile } from '@/lib/supabase/profile';

function patientFullName(patients: any): string {
  return `${patients?.first_name || ''} ${patients?.last_name || ''}`.trim() || 'Unknown';
}

/**
 * Generate a PDF receipt for a medicine (pharmacy) payment.
 * Returns a Promise<Buffer>, or null if the payment can't be found or isn't
 * actually a medicine payment.
 */
export async function generateMedicineReceipt(paymentId: string): Promise<Buffer | null> {
  const supabase = createServerSupabaseClient();
  const profile = await getOrCreateProfile();

  if (!profile) return null;

  const { data: payment, error: paymentError } = await supabase
    .from('payments')
    .select(
      `*, patients (first_name, last_name, patient_id_number),
       profiles!doctor_id (full_name),
       payment_line_items (
         id, description, quantity, unit_price, total_price,
         sort_order, dispensation_id
       ),
       payment_collections (
         id, amount_collected, collection_date,
         payment_method, transaction_reference
       )`
    )
    .eq('id', paymentId)
    .eq('clinic_id', profile.clinic_id)
    .eq('payment_source', 'medicine')
    .single();

  if (paymentError || !payment) {
    console.error('[generateMedicineReceipt] Medicine payment not found');
    return null;
  }

  const { data: clinic } = await supabase
    .from('clinics')
    .select('name, address, city, state, postal_code, phone, email, license_number, gst_number')
    .eq('id', profile.clinic_id)
    .single();

  const lineItems: any[] = (payment.payment_line_items || []).sort(
    (a: any, b: any) => a.sort_order - b.sort_order
  );
  const hasLineItems = lineItems.length > 0;
  const collections: any[] = payment.payment_collections || [];

  try {
    const pdfDoc = await PDFDocument.create();
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontReg = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const page = pdfDoc.addPage([595, 842]);
    const { width, height } = page.getSize();
    const margin = 40;
    const inner = width - margin * 2;

    // ── Design tokens (matches payments/document-generator.ts) ──
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

    const ghost = 'MEDICINE';
    const ghostW = fontBold.widthOfTextAtSize(ghost, 32);
    page.drawText(ghost, {
      x: width - margin - ghostW, y: height - 56, size: 32, font: fontBold, color: white, opacity: 0.10,
    });

    // ── 2. META BAR ──
    const MB = 40;
    const mbY = height - HH - MB;
    page.drawRectangle({ x: 0, y: mbY, width, height: MB, color: tealTint });

    if (payment.receipt_number) {
      page.drawText('RECEIPT NO.', { x: margin, y: mbY + MB - 14, size: 6.5, font: fontBold, color: teal });
      page.drawText(payment.receipt_number, { x: margin, y: mbY + 9, size: 12, font: fontBold, color: tealDk });
    }

    const pidTxt = 'ID: ' + paymentId.slice(0, 8).toUpperCase() + '...';
    const pidW = fontReg.widthOfTextAtSize(pidTxt, 7.5);
    page.drawText(pidTxt, { x: (width - pidW) / 2, y: mbY + 16, size: 7.5, font: fontReg, color: mid });

    const dateStr = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
    const dateStrW = fontBold.widthOfTextAtSize(dateStr, 10);
    page.drawText('DATE', {
      x: width - margin - dateStrW, y: mbY + MB - 14, size: 6.5, font: fontBold, color: teal,
    });
    page.drawText(dateStr, {
      x: width - margin - dateStrW, y: mbY + 9, size: 10, font: fontBold, color: ink,
    });

    let y = mbY - 24;

    // ── 3. BILLED TO / PRESCRIBED BY ──
    const c1 = margin;
    const c2 = width / 2 + 8;
    const cw = width / 2 - margin - 8;

    page.drawText('BILLED TO', { x: c1, y, size: 6.5, font: fontBold, color: teal });
    page.drawText('PRESCRIBED BY', { x: c2, y, size: 6.5, font: fontBold, color: teal });
    y -= 5;

    page.drawLine({ start: { x: c1, y }, end: { x: c1 + cw, y }, thickness: 0.6, color: teal });
    page.drawLine({ start: { x: c2, y }, end: { x: c2 + cw, y }, thickness: 0.6, color: teal });
    y -= 14;

    const doctorName = payment.profiles?.full_name || 'N/A';
    page.drawText(patientName, { x: c1, y, size: 12, font: fontBold, color: ink });
    page.drawText(
      'Dr. ' + (doctorName.length > 26 ? doctorName.slice(0, 26) + '...' : doctorName),
      { x: c2, y, size: 12, font: fontBold, color: ink }
    );
    y -= 15;

    page.drawText('MRN: ' + (payment.patients?.patient_id_number || 'N/A'), {
      x: c1, y, size: 9, font: fontReg, color: mid,
    });
    y -= 22;

    // ── 4. MEDICINES DISPENSED (itemised bill) ──
    if (hasLineItems) {
      page.drawText('MEDICINES DISPENSED', { x: margin, y, size: 6.5, font: fontBold, color: teal });
      y -= 5;
      page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 0.6, color: teal });
      y -= 2;

      const rightEdge = margin + inner;
      const qtyRight = margin + inner * 0.52;
      const upRight = margin + inner * 0.77;

      const thH = 18;
      const thY = y - thH;
      page.drawRectangle({ x: margin, y: thY, width: inner, height: thH, color: rgb(0.91, 0.91, 0.91) });

      page.drawText('MEDICINE', { x: margin + 10, y: thY + 5, size: 7, font: fontBold, color: mid });

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
      // discounted_from_amount is only ever set when the billed total
      // differs from the sum of line items — surface that explicitly
      // rather than silently showing a total that doesn't match.
      if (payment.discounted_from_amount != null) {
        page.drawText(
          'Subtotal: ' + fmt(payment.discounted_from_amount) +
          '   Discount: -' + fmt(payment.discounted_from_amount - payment.amount_charged),
          { x: margin, y, size: 9, font: fontReg, color: mid }
        );
        y -= 20;
      } else {
        page.drawText('No line items recorded.', { x: margin, y, size: 9, font: fontReg, color: muted });
        y -= 20;
      }
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
    console.error('[generateMedicineReceipt] Error:', error);
    return null;
  }
}