// src/app/api/payments/[id]/receipt/route.ts

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

  if (error || !payment) {
    return new NextResponse('Payment not found', { status: 404 });
  }

  const { data: clinic } = await supabase
    .from('clinics')
    .select('name, address, city, state, postal_code, phone, email, license_number, gst_number, hfr_id, show_branding_footer')
    .eq('id', profile.clinic_id)
    .single();

  // Fetch line items — backward compatible (may be empty for old charges)
  const { data: lineItemsRaw } = await supabase
    .from('payment_line_items')
    .select('*')
    .eq('payment_id', paymentId)
    .eq('clinic_id', profile.clinic_id)
    .order('sort_order', { ascending: true });

  const lineItems: any[]  = lineItemsRaw || [];
  const hasLineItems      = lineItems.length > 0;

  try {
    const pdfDoc  = await PDFDocument.create();
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontReg  = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const page = pdfDoc.addPage([595, 842]);
    const { width, height } = page.getSize();
    const margin = 40;
    const inner  = width - margin * 2;

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
    const emerald  = rgb(0.07, 0.52, 0.27);
    const rose     = rgb(0.72, 0.10, 0.10);

    const fmt = (v: number) =>
      'Rs. ' +
      Number(v).toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

    const METHOD: Record<string, string> = {
      cash: 'Cash', card: 'Card', upi: 'UPI',
      bank_transfer: 'Bank Transfer', check: 'Cheque', other: 'Other',
    };

    const patientName =
      ((payment.patients?.first_name || '') +
        ' ' +
        (payment.patients?.last_name || '')).trim() || 'Unknown';

    const collections: any[] = payment.payment_collections || [];

    // ── 1. HEADER ─────────────────────────────────────────────────
    const HH = 90;
    page.drawRectangle({ x: 0, y: height - HH, width, height: HH, color: teal });
    page.drawRectangle({ x: 0, y: height - 5,  width, height: 5,  color: tealDk });

    page.drawText(clinic?.name || 'Clinic', {
      x: margin, y: height - 30, size: 20, font: fontBold, color: white,
    });

    const addrParts = [
      clinic?.address, clinic?.city, clinic?.state, clinic?.postal_code,
    ].filter(Boolean);
    if (addrParts.length > 0) {
      page.drawText(addrParts.join(', '), {
        x: margin, y: height - 48, size: 8.5, font: fontReg,
        color: rgb(0.82, 0.95, 0.95),
      });
    }

    const contactLine = [clinic?.phone, clinic?.email].filter(Boolean).join('   ·   ');
    if (contactLine) {
      page.drawText(contactLine, {
        x: margin, y: height - 62, size: 8, font: fontReg,
        color: rgb(0.75, 0.91, 0.91),
      });
    }

    const regLine = [
      clinic?.license_number ? 'Reg: ' + clinic.license_number : null,
      clinic?.gst_number ? 'GST: ' + clinic.gst_number : null,
    ].filter(Boolean).join('   ·   ');
    if (regLine) {
      page.drawText(regLine, {
        x: margin, y: height - 75, size: 7.5, font: fontReg,
        color: rgb(0.68, 0.87, 0.87),
      });
    }

    // Ghost watermark
    const ghost  = 'RECEIPT';
    const ghostW = fontBold.widthOfTextAtSize(ghost, 38);
    page.drawText(ghost, {
      x: width - margin - ghostW, y: height - 56,
      size: 38, font: fontBold, color: white, opacity: 0.10,
    });

    // ── 2. META BAR ───────────────────────────────────────────────
    const MB  = 40;
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
    const pidW   = fontReg.widthOfTextAtSize(pidTxt, 7.5);
    page.drawText(pidTxt, {
      x: (width - pidW) / 2, y: mbY + 16, size: 7.5, font: fontReg, color: mid,
    });

    const dateStr  = new Date().toLocaleDateString('en-IN', {
      day: 'numeric', month: 'long', year: 'numeric',
    });
    const dateStrW = fontBold.widthOfTextAtSize(dateStr, 10);
    page.drawText('DATE', {
      x: width - margin - dateStrW, y: mbY + MB - 14,
      size: 6.5, font: fontBold, color: teal,
    });
    page.drawText(dateStr, {
      x: width - margin - dateStrW, y: mbY + 9,
      size: 10, font: fontBold, color: ink,
    });

    let y = mbY - 24;

    // ── 3. BILLED TO / SERVICE ────────────────────────────────────
    const c1 = margin;
    const c2 = width / 2 + 8;
    const cw = width / 2 - margin - 8;

    page.drawText('BILLED TO', {
      x: c1, y, size: 6.5, font: fontBold, color: teal,
    });
    page.drawText('SERVICE', {
      x: c2, y, size: 6.5, font: fontBold, color: teal,
    });
    y -= 5;

    page.drawLine({
      start: { x: c1, y }, end: { x: c1 + cw, y }, thickness: 0.6, color: teal,
    });
    page.drawLine({
      start: { x: c2, y }, end: { x: c2 + cw, y }, thickness: 0.6, color: teal,
    });
    y -= 14;

    // Service label: if line items exist show count, else show description
    const svcLabel = hasLineItems
      ? lineItems.length + ' service' + (lineItems.length !== 1 ? 's' : '')
      : (payment.description || 'Consultation').slice(0, 26);

    page.drawText(patientName, {
      x: c1, y, size: 12, font: fontBold, color: ink,
    });
    page.drawText(svcLabel, {
      x: c2, y, size: 12, font: fontBold, color: ink,
    });
    y -= 15;

    page.drawText('MRN: ' + (payment.patients?.patient_id_number || 'N/A'), {
      x: c1, y, size: 9, font: fontReg, color: mid,
    });

    const apptDate = payment.appointments?.appointment_date
      ? new Date(payment.appointments.appointment_date).toLocaleDateString('en-IN')
      : null;
    if (apptDate) {
      page.drawText('Date: ' + apptDate, {
        x: c2, y, size: 9, font: fontReg, color: mid,
      });
    }
    y -= 13;

    const doctorName = payment.profiles?.full_name || 'N/A';
    page.drawText(
      'Dr. ' +
        (doctorName.length > 26 ? doctorName.slice(0, 26) + '...' : doctorName),
      { x: c2, y, size: 9, font: fontReg, color: mid }
    );
    y -= 22;

    // ── 4. ITEMISED BILL TABLE (only when line items exist) ───────
    if (hasLineItems) {
      // Section label
      page.drawText('ITEMISED BILL', {
        x: margin, y, size: 6.5, font: fontBold, color: teal,
      });
      y -= 5;
      page.drawLine({
        start: { x: margin, y }, end: { x: width - margin, y },
        thickness: 0.6, color: teal,
      });
      y -= 2;

      // Column positions
      const rightEdge = margin + inner;       // 555
      const qtyRight  = margin + inner * 0.52; // ~307
      const upRight   = margin + inner * 0.77; // ~437
      // totalRight = rightEdge (555)

      // Table header row
      const thH = 18;
      const thY = y - thH;
      page.drawRectangle({
        x: margin, y: thY, width: inner, height: thH,
        color: rgb(0.91, 0.91, 0.91),
      });

      // Description label (left)
      page.drawText('DESCRIPTION', {
        x: margin + 10, y: thY + 5, size: 7, font: fontBold, color: mid,
      });

      // Qty label (right-aligned in its column)
      const qtyHdr    = 'QTY';
      const qtyHdrW   = fontBold.widthOfTextAtSize(qtyHdr, 7);
      page.drawText(qtyHdr, {
        x: qtyRight - qtyHdrW, y: thY + 5, size: 7, font: fontBold, color: mid,
      });

      // Unit price label (right-aligned)
      const upHdr  = 'UNIT PRICE';
      const upHdrW = fontBold.widthOfTextAtSize(upHdr, 7);
      page.drawText(upHdr, {
        x: upRight - upHdrW, y: thY + 5, size: 7, font: fontBold, color: mid,
      });

      // Total label (right-aligned)
      const totHdr  = 'TOTAL';
      const totHdrW = fontBold.widthOfTextAtSize(totHdr, 7);
      page.drawText(totHdr, {
        x: rightEdge - 10 - totHdrW, y: thY + 5, size: 7, font: fontBold, color: mid,
      });

      y = thY;

      // Item rows
      lineItems.forEach((item: any, idx: number) => {
        const rH    = 22;
        const rY    = y - rH;
        const total = Number(item.total_price || 0);
        const up    = Number(item.unit_price || 0);

        // Alternating tint
        if (idx % 2 === 1) {
          page.drawRectangle({
            x: margin, y: rY, width: inner, height: rH,
            color: rgb(0.97, 0.97, 0.97),
          });
        }

        // Description (left, truncate if needed)
        const descMax  = 38;
        const descDisp = item.description.length > descMax
          ? item.description.slice(0, descMax) + '...'
          : item.description;
        page.drawText(descDisp, {
          x: margin + 10, y: rY + 7, size: 9, font: fontReg, color: ink,
        });

        // Qty (right-aligned in qty column)
        const qtyTxt = String(item.quantity);
        const qtyW   = fontReg.widthOfTextAtSize(qtyTxt, 9);
        page.drawText(qtyTxt, {
          x: qtyRight - qtyW, y: rY + 7, size: 9, font: fontReg, color: mid,
        });

        // Unit price (right-aligned)
        const upTxt = fmt(up);
        const upW   = fontReg.widthOfTextAtSize(upTxt, 9);
        page.drawText(upTxt, {
          x: upRight - upW, y: rY + 7, size: 9, font: fontReg, color: mid,
        });

        // Line total (right-aligned, bold)
        const totTxt = fmt(total);
        const totW   = fontBold.widthOfTextAtSize(totTxt, 9);
        page.drawText(totTxt, {
          x: rightEdge - 10 - totW, y: rY + 7, size: 9, font: fontBold, color: ink,
        });

        // Row bottom border
        page.drawLine({
          start: { x: margin, y: rY }, end: { x: rightEdge, y: rY },
          thickness: 0.3, color: border,
        });

        y = rY;
      });

      // Grand total row (only when multiple items)
      if (lineItems.length > 1) {
        const gtH = 20;
        const gtY = y - gtH;
        page.drawRectangle({
          x: margin, y: gtY, width: inner, height: gtH,
          color: rgb(0.92, 0.98, 0.98),
        });

        const gtLabel  = 'GRAND TOTAL';
        page.drawText(gtLabel, {
          x: margin + 10, y: gtY + 6, size: 8, font: fontBold, color: tealDk,
        });

        const gtAmt  = fmt(payment.amount_charged);
        const gtAmtW = fontBold.widthOfTextAtSize(gtAmt, 11);
        page.drawText(gtAmt, {
          x: rightEdge - 10 - gtAmtW, y: gtY + 5,
          size: 11, font: fontBold, color: tealDk,
        });

        y = gtY;
      }

      y -= 20;
    } else {
      y -= 8; // existing charges without line items: small gap before summary box
    }

    // ── 5. AMOUNT SUMMARY BOX ─────────────────────────────────────
    const boxH = 80;
    const boxY = y - boxH;
    const t3   = inner / 3;

    page.drawRectangle({
      x: margin, y: boxY, width: inner, height: boxH,
      color: surface, borderColor: border, borderWidth: 0.5,
    });

    // Left teal accent stripe
    page.drawRectangle({
      x: margin, y: boxY, width: 4, height: boxH, color: teal,
    });

    // Column dividers
    page.drawLine({
      start: { x: margin + t3,     y: boxY + 10 },
      end:   { x: margin + t3,     y: boxY + boxH - 10 },
      thickness: 0.4, color: border,
    });
    page.drawLine({
      start: { x: margin + t3 * 2, y: boxY + 10 },
      end:   { x: margin + t3 * 2, y: boxY + boxH - 10 },
      thickness: 0.4, color: border,
    });

    // Col 1 — Charged
    page.drawText('AMOUNT CHARGED', {
      x: margin + 18, y: boxY + 60, size: 6.5, font: fontBold, color: mid,
    });
    page.drawText(fmt(payment.amount_charged), {
      x: margin + 18, y: boxY + 38, size: 15, font: fontBold, color: ink,
    });

    // Col 2 — Paid
    page.drawText('AMOUNT PAID', {
      x: margin + t3 + 18, y: boxY + 60, size: 6.5, font: fontBold, color: mid,
    });
    page.drawText(fmt(payment.amount_paid), {
      x: margin + t3 + 18, y: boxY + 38, size: 15, font: fontBold, color: emerald,
    });

    // Col 3 — Outstanding
    page.drawText('OUTSTANDING', {
      x: margin + t3 * 2 + 18, y: boxY + 60, size: 6.5, font: fontBold, color: mid,
    });
    const outAmt  = payment.outstanding_balance;
    const outText = outAmt > 0 ? fmt(outAmt) : 'Nil';
    const outSize = outAmt > 0 ? 15 : 18;
    page.drawText(outText, {
      x: margin + t3 * 2 + 18, y: boxY + 38,
      size: outSize, font: fontBold, color: outAmt > 0 ? rose : emerald,
    });

    // Status badge
    const statusLabel =
      payment.payment_status === 'paid'    ? 'PAID IN FULL'
      : payment.payment_status === 'partial' ? 'PARTIALLY PAID'
      : 'UNPAID';
    const statusBg =
      payment.payment_status === 'paid'    ? emerald
      : payment.payment_status === 'partial' ? rgb(0.25, 0.45, 0.87)
      : rose;

    const slW     = fontBold.widthOfTextAtSize(statusLabel, 7.5);
    const badgeW  = slW + 18;
    const badgeH  = 17;
    const badgeX  = margin + inner - badgeW - 12;
    const badgeY  = boxY + 10;
    page.drawRectangle({
      x: badgeX, y: badgeY, width: badgeW, height: badgeH, color: statusBg,
    });
    page.drawText(statusLabel, {
      x: badgeX + 9, y: badgeY + 5, size: 7.5, font: fontBold, color: white,
    });

    y = boxY - 24;

    // ── 6. COLLECTION HISTORY TABLE ───────────────────────────────
    if (collections.length > 0) {
      page.drawText('COLLECTION HISTORY', {
        x: margin, y, size: 6.5, font: fontBold, color: teal,
      });
      y -= 5;
      page.drawLine({
        start: { x: margin, y }, end: { x: width - margin, y },
        thickness: 0.6, color: teal,
      });
      y -= 2;

      // Table header
      const thH = 18;
      const thY = y - thH;
      page.drawRectangle({
        x: margin, y: thY, width: inner, height: thH,
        color: rgb(0.90, 0.90, 0.90),
      });

      const tc1 = margin + 10;
      const tc2 = margin + 115;
      const tc3 = margin + 235;
      const tc4 = margin + 375;

      page.drawText('DATE',            { x: tc1, y: thY + 5, size: 7, font: fontBold, color: mid });
      page.drawText('METHOD',          { x: tc2, y: thY + 5, size: 7, font: fontBold, color: mid });
      page.drawText('REFERENCE / UTR', { x: tc3, y: thY + 5, size: 7, font: fontBold, color: mid });
      page.drawText('AMOUNT',          { x: tc4, y: thY + 5, size: 7, font: fontBold, color: mid });

      y = thY;

      collections.forEach((col: any, idx: number) => {
        const rH = 22;
        const rY = y - rH;

        if (idx % 2 === 1) {
          page.drawRectangle({
            x: margin, y: rY, width: inner, height: rH,
            color: rgb(0.97, 0.97, 0.97),
          });
        }

        const colDate = new Date(col.collection_date).toLocaleDateString('en-IN');
        const method  = METHOD[col.payment_method as string] || col.payment_method;
        const ref     = col.transaction_reference || '\u2014';
        const refDisp = ref.length > 22 ? ref.slice(0, 22) + '...' : ref;

        page.drawText(colDate,  { x: tc1, y: rY + 7, size: 9, font: fontReg,  color: ink });
        page.drawText(method,   { x: tc2, y: rY + 7, size: 9, font: fontReg,  color: ink });
        page.drawText(refDisp,  { x: tc3, y: rY + 7, size: 9, font: fontReg,  color: mid });
        page.drawText(fmt(col.amount_collected), {
          x: tc4, y: rY + 7, size: 9, font: fontBold, color: ink,
        });

        page.drawLine({
          start: { x: margin, y: rY }, end: { x: margin + inner, y: rY },
          thickness: 0.3, color: border,
        });

        y = rY;
      });

      y -= 8;
    }

    // ── 7. FOOTER ─────────────────────────────────────────────────
    const ftY = 48;
    page.drawLine({
      start: { x: margin, y: ftY + 30 },
      end:   { x: width - margin, y: ftY + 30 },
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
      page.drawText('Queries: ' + queryLine, {
        x: margin, y: ftY + 6, size: 7.5, font: fontReg, color: muted,
      });
    }

    if (clinic?.show_branding_footer) {
      const brand  = 'Powered by CURA HealthTech';
      const brandW = fontReg.widthOfTextAtSize(brand, 7);
      page.drawText(brand, {
        x: width - margin - brandW, y: ftY + 6,
        size: 7, font: fontReg, color: rgb(0.80, 0.80, 0.80),
      });
    }

    const pdfBytes = await pdfDoc.save();

    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition':
          'attachment; filename="' +
          (payment.receipt_number || paymentId.slice(0, 8)) +
          '.pdf"',
        'Content-Length': pdfBytes.length.toString(),
      },
    });
  } catch (err) {
    console.error('[receipt/route] PDF error:', err);
    return new NextResponse('Failed to generate PDF', { status: 500 });
  }
}