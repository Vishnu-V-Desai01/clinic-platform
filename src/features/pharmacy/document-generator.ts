// src/features/pharmacy/document-generator.ts
//
// Medicine receipt PDF generation. Deliberately a separate function/file
// from src/features/payments/document-generator.ts rather than extending
// generatePaymentReceipt() — a medicine receipt's structure (per-drug line
// items, batch/expiry-adjacent info) doesn't fit the consultation receipt's
// layout, and keeping them separate means neither generator has to grow
// conditional branches for the other's shape.
//
// Visual style intentionally mirrors payments/document-generator.ts (same
// margins, font sizes, header/footer conventions) so a patient holding both
// receipt types sees a consistent clinic identity, without sharing code
// that would otherwise couple two independently-evolving documents.

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
      `
      *,
      patients (first_name, last_name, patient_id_number),
      profiles!doctor_id (full_name),
      payment_line_items (
        id,
        description,
        quantity,
        unit_price,
        total_price,
        sort_order,
        dispensation_id
      )
    `
    )
    .eq('id', paymentId)
    .eq('clinic_id', profile.clinic_id)
    .eq('payment_source', 'medicine')
    .single();

  if (paymentError || !payment) {
    console.error('[generateMedicineReceipt] Medicine payment not found');
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

    // Header
    const title = 'Medicine Receipt';
    const titleWidth = fontBold.widthOfTextAtSize(title, 20);
    page.drawText(title, { x: (width - titleWidth) / 2, y, size: 20, font: fontBold, color: black });
    y -= 28;
    const sub = 'Generated: ' + new Date().toLocaleString('en-IN');
    const subWidth = fontReg.widthOfTextAtSize(sub, 9);
    page.drawText(sub, { x: (width - subWidth) / 2, y, size: 9, font: fontReg, color: gray });
    y -= 20;
    drawLine(rgb(0.7, 0.7, 0.7));
    y -= 4;

    drawText('Receipt No: ' + (payment.receipt_number || 'N/A'), { font: fontBold });
    drawText('Payment ID: ' + paymentId);
    drawText('Receipt Date: ' + new Date().toLocaleDateString('en-IN'));
    y -= 6;

    drawText('Patient Information', { font: fontBold, size: 12 });
    drawLine();
    drawText('Name:  ' + patientName);
    drawText('MRN:   ' + (payment.patients?.patient_id_number || 'N/A'));
    drawText('Prescribed by: Dr. ' + (payment.profiles?.full_name || 'N/A'));
    y -= 6;

    drawText('Medicines Dispensed', { font: fontBold, size: 12 });
    drawLine();

    const lineItems: any[] = (payment.payment_line_items || []).sort(
      (a: any, b: any) => a.sort_order - b.sort_order
    );

    if (lineItems.length === 0) {
      drawText('No line items recorded.', { color: gray });
    } else {
      lineItems.forEach((item: any, idx: number) => {
        const line =
          idx + 1 + '.  ' + item.description +
          '  x' + item.quantity +
          '  @ ' + formatAmt(item.unit_price) +
          '  =  ' + formatAmt(item.total_price);
        drawText(line);
      });
    }
    y -= 6;

    drawText('Payment Summary', { font: fontBold, size: 12 });
    drawLine();

    // discounted_from_amount is only ever set when the billed total differs
    // from the sum of line items — surface that explicitly on the receipt
    // rather than silently showing a total that doesn't match the line
    // items above it.
    if (payment.discounted_from_amount != null) {
      drawText('Subtotal:        ' + formatAmt(payment.discounted_from_amount));
      drawText('Discount Applied: -' + formatAmt(payment.discounted_from_amount - payment.amount_charged));
    }
    drawText('Total Charged:   ' + formatAmt(payment.amount_charged), { font: fontBold });
    drawText('Amount Paid:     ' + formatAmt(payment.amount_paid), { color: green });
    y -= 6;

    drawLine(rgb(0.7, 0.7, 0.7));
    const footer = 'This is a computer-generated receipt. No signature required.';
    const footerWidth = fontReg.widthOfTextAtSize(footer, 9);
    page.drawText(footer, { x: (width - footerWidth) / 2, y, size: 9, font: fontReg, color: gray });

    // Watermark — added Item 9. Medicine receipts previously had no
    // watermark at all (unlike the consultation receipt and treatment
    // PDFs, which had a "Powered by CURA" footer). Now mandatory and
    // unconditional for every clinic, styled to match those two documents:
    // 7pt, light gray, right-aligned within the page margin.
    const brand = 'powered by Curakin HealthTech';
    const brandWidth = fontReg.widthOfTextAtSize(brand, 7);
    page.drawText(brand, {
      x: width - margin - brandWidth, y,
      size: 7, font: fontReg, color: rgb(0.80, 0.80, 0.80),
    });

    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
  } catch (error) {
    console.error('[generateMedicineReceipt] Error:', error);
    return null;
  }
}