// src/app/api/payments/[id]/receipt/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getOrCreateProfile } from '@/lib/supabase/profile';
import PDFDocument from 'pdfkit';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Auth check
  const { userId } = await auth();
  if (!userId) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const { id: paymentId } = await params;

  const supabase = createServerSupabaseClient();
  const profile = await getOrCreateProfile();

  if (!profile || !['doctor', 'staff'].includes(profile.role)) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  // Fetch payment with all joined data
  const { data: payment, error } = await supabase
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

  if (error || !payment) {
    return new NextResponse('Payment not found', { status: 404 });
  }

  // Generate PDF
  const doc = new PDFDocument({ margin: 50 });
  const chunks: Buffer[] = [];

  doc.on('data', (chunk) => chunks.push(chunk));

  const patientName =
    `${payment.patients?.first_name || ''} ${payment.patients?.last_name || ''}`.trim() ||
    'Unknown';

  const appointmentDate = payment.appointments?.appointment_date
    ? new Date(payment.appointments.appointment_date).toLocaleDateString('en-IN')
    : null;

  const formatAmount = (amount: number) =>
    `Rs. ${Number(amount).toFixed(2)}`;

  // ── Header ──────────────────────────────────────────────────────
  doc
    .fontSize(20)
    .font('Helvetica-Bold')
    .text('Payment Receipt', { align: 'center' });

  doc.moveDown(0.3);
  doc
    .fontSize(9)
    .font('Helvetica')
    .fillColor('#888')
    .text(`Generated: ${new Date().toLocaleString('en-IN')}`, { align: 'center' });
  doc.fillColor('#000');
  doc.moveDown(0.8);
  doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#ccc');
  doc.moveDown(0.8);

  // ── Reference ────────────────────────────────────────────────────
  doc.fontSize(10).font('Helvetica');
  doc.text(`Payment ID: ${paymentId}`);
  doc.text(`Receipt Date: ${new Date().toLocaleDateString('en-IN')}`);
  doc.moveDown();

  // ── Patient Info ─────────────────────────────────────────────────
  doc.fontSize(12).font('Helvetica-Bold').text('Patient Information');
  doc.moveTo(50, doc.y + 2).lineTo(545, doc.y + 2).stroke('#ddd');
  doc.moveDown(0.5);
  doc.fontSize(10).font('Helvetica');
  doc.text(`Name: ${patientName}`);
  doc.text(`MRN:  ${payment.patients?.patient_id_number || 'N/A'}`);
  doc.moveDown();

  // ── Charge Details ───────────────────────────────────────────────
  doc.fontSize(12).font('Helvetica-Bold').text('Charge Details');
  doc.moveTo(50, doc.y + 2).lineTo(545, doc.y + 2).stroke('#ddd');
  doc.moveDown(0.5);
  doc.fontSize(10).font('Helvetica');
  doc.text(`Service: ${payment.description || 'Consultation'}`);
  if (appointmentDate) doc.text(`Appointment Date: ${appointmentDate}`);
  doc.text(`Doctor:  ${payment.profiles?.full_name || 'N/A'}`);
  doc.moveDown();

  // ── Payment Summary ──────────────────────────────────────────────
  doc.fontSize(12).font('Helvetica-Bold').text('Payment Summary');
  doc.moveTo(50, doc.y + 2).lineTo(545, doc.y + 2).stroke('#ddd');
  doc.moveDown(0.5);
  doc.fontSize(10).font('Helvetica');
  doc.text(`Amount Charged:   ${formatAmount(payment.amount_charged)}`);
  doc.text(`Amount Paid:      ${formatAmount(payment.amount_paid)}`);

  if (payment.outstanding_balance > 0) {
    doc.fillColor('red');
    doc.text(`Outstanding:      ${formatAmount(payment.outstanding_balance)}`);
    doc.fillColor('#000');
  } else {
    doc.fillColor('#16a34a');
    doc.text('Outstanding:      Rs. 0.00  ✓ Fully Paid');
    doc.fillColor('#000');
  }
  doc.moveDown();

  // ── Collection History ───────────────────────────────────────────
  const collections: any[] = payment.payment_collections || [];
  if (collections.length > 0) {
    doc.fontSize(12).font('Helvetica-Bold').text('Collection History');
    doc.moveTo(50, doc.y + 2).lineTo(545, doc.y + 2).stroke('#ddd');
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica');

    collections.forEach((col, idx) => {
      const colDate = new Date(col.collection_date).toLocaleDateString('en-IN');
      const ref = col.transaction_reference ? `  Ref: ${col.transaction_reference}` : '';
      doc.text(
        `${idx + 1}.  ${colDate}  —  ${col.payment_method.toUpperCase()}  —  ${formatAmount(col.amount_collected)}${ref}`
      );
    });
    doc.moveDown();
  }

  // ── Footer ───────────────────────────────────────────────────────
  doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#ccc');
  doc.moveDown(0.5);
  doc
    .fontSize(9)
    .fillColor('#888')
    .text('This is a computer-generated receipt. No signature required.', {
      align: 'center',
    });

  // Finalise and collect buffer
  const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });

 return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="receipt-${paymentId.slice(0, 8)}.pdf"`,
      'Content-Length': pdfBuffer.length.toString(),
    },
  });
}