import { NextResponse } from 'next/server'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * Seller details printed on every invoice. Fill in the address and email
 * before real clinics receive these.
 */
const SELLER = {
  name: 'CURAKIN HealthTech',
  addressLines: [] as string[], // e.g. ['Street', 'Bengaluru, Karnataka 560001']
  email: null as string | null,
}

/**
 * The built-in PDF fonts only cover basic Latin, so anything else
 * (including the ₹ sign and non-English clinic names) is stripped rather
 * than crashing the render. Amounts are printed as "Rs.".
 */
function safe(value: string | null | undefined): string {
  return (value ?? '')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[^\x20-\x7E]/g, '')
    .trim()
}

function rupees(paise: number): string {
  return `Rs. ${(paise / 100).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function dateIST(iso: string | null): string {
  if (!iso) return '-'
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(iso))
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const supabase = createServerSupabaseClient()

  // RLS scopes this to the caller's own clinic, so another clinic's
  // invoice id simply returns no row.
  const { data: invoice, error: invoiceError } = await supabase
    .from('invoices')
    .select(
      'id, clinic_id, invoice_number, description, subtotal_paise, gst_mode, gst_rate_bp, gst_amount_paise, total_paise, seller_gstin, buyer_gstin, status, issued_at, paid_at, razorpay_payment_id'
    )
    .eq('id', id)
    .maybeSingle()

  if (invoiceError) {
    console.error('[invoice pdf] invoice lookup failed:', invoiceError)
    return NextResponse.json({ error: 'Could not load invoice' }, { status: 500 })
  }

  if (!invoice) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { data: clinic, error: clinicError } = await supabase
    .from('clinics')
    .select('name, address, city, state, postal_code')
    .eq('id', invoice.clinic_id)
    .maybeSingle()

  if (clinicError) {
    console.error('[invoice pdf] clinic lookup failed:', clinicError)
  }

  const pdf = await PDFDocument.create()
  const page = pdf.addPage([595.28, 841.89]) // A4
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)

  const left = 50
  const right = 545
  const ink = rgb(0.1, 0.1, 0.1)
  const muted = rgb(0.4, 0.4, 0.4)
  const line = rgb(0.8, 0.8, 0.8)

  const text = (
    value: string,
    x: number,
    y: number,
    size = 10,
    font = regular,
    color = ink
  ) => page.drawText(safe(value), { x, y, size, font, color })

  const textRight = (
    value: string,
    xRight: number,
    y: number,
    size = 10,
    font = regular,
    color = ink
  ) => {
    const s = safe(value)
    text(s, xRight - font.widthOfTextAtSize(s, size), y, size, font, color)
  }

  const rule = (y: number) =>
    page.drawLine({
      start: { x: left, y },
      end: { x: right, y },
      thickness: 0.7,
      color: line,
    })

  // Header
  text('INVOICE', left, 790, 22, bold)
  text(SELLER.name, left, 768, 11, bold)
  let sellerY = 754
  for (const addressLine of SELLER.addressLines) {
    text(addressLine, left, sellerY, 9, regular, muted)
    sellerY -= 12
  }
  if (SELLER.email) {
    text(SELLER.email, left, sellerY, 9, regular, muted)
    sellerY -= 12
  }
  text(
    invoice.seller_gstin ? `GSTIN: ${invoice.seller_gstin}` : 'Not registered under GST',
    left,
    sellerY,
    9,
    regular,
    muted
  )

  // Invoice meta (right column)
  textRight('Invoice No.', right, 790, 9, regular, muted)
  textRight(invoice.invoice_number, right, 776, 11, bold)
  textRight('Date', right, 758, 9, regular, muted)
  textRight(dateIST(invoice.issued_at), right, 744, 10)
  textRight('Status', right, 726, 9, regular, muted)
  textRight(String(invoice.status).toUpperCase(), right, 712, 10, bold)

  rule(690)

  // Billed to
  text('BILLED TO', left, 670, 9, bold, muted)
  text(clinic?.name ?? 'Clinic', left, 654, 11, bold)
  let billY = 640
  const cityLine = [clinic?.city, clinic?.state, clinic?.postal_code]
    .filter(Boolean)
    .join(', ')
  for (const l of [clinic?.address, cityLine]) {
    if (l && safe(l)) {
      text(l, left, billY, 9, regular, muted)
      billY -= 12
    }
  }
  if (invoice.buyer_gstin) {
    text(`GSTIN: ${invoice.buyer_gstin}`, left, billY, 9, regular, muted)
  }

  // Line item
  const tableTop = 580
  rule(tableTop + 18)
  text('DESCRIPTION', left, tableTop, 9, bold, muted)
  textRight('AMOUNT', right, tableTop, 9, bold, muted)
  rule(tableTop - 10)

  text(invoice.description || 'Subscription payment', left, tableTop - 30, 11)
  textRight(rupees(invoice.subtotal_paise), right, tableTop - 30, 11)
  rule(tableTop - 46)

  // Totals
  let y = tableTop - 70
  textRight(`Subtotal   ${rupees(invoice.subtotal_paise)}`, right, y, 10)
  y -= 16

  if (invoice.gst_amount_paise > 0) {
    const pct = (invoice.gst_rate_bp / 100).toFixed(0)
    textRight(`GST @ ${pct}%   ${rupees(invoice.gst_amount_paise)}`, right, y, 10)
    y -= 16
  }

  textRight(`Total   ${rupees(invoice.total_paise)}`, right, y - 4, 13, bold)
  y -= 34

  if (invoice.paid_at) {
    text(`Paid on ${dateIST(invoice.paid_at)}`, left, y, 9, regular, muted)
    y -= 12
  }
  if (invoice.razorpay_payment_id) {
    text(`Payment reference: ${invoice.razorpay_payment_id}`, left, y, 9, regular, muted)
  }

  // Footer
  rule(80)
  text(
    invoice.seller_gstin
      ? 'This is a computer-generated invoice.'
      : 'This is a computer-generated invoice. No GST has been charged.',
    left,
    62,
    8,
    regular,
    muted
  )

  const bytes = await pdf.save()
  const fileName = safe(invoice.invoice_number).replace(/[^A-Za-z0-9_-]/g, '-')

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${fileName}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  })
}