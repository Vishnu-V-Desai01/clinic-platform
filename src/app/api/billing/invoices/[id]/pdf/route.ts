import { NextResponse } from 'next/server'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * Seller details printed in the header of every invoice. Fill in the
 * address, phone and email before real clinics receive these.
 */
const SELLER = {
  name: 'CURAKIN HealthTech',
  addressLines: [] as string[], // e.g. ['Street', 'Bengaluru, Karnataka 560001']
  phone: null as string | null,
  email: null as string | null,
}

/**
 * The built-in PDF fonts only cover basic Latin, so anything else
 * (including the rupee sign and non-English clinic names) is stripped
 * rather than crashing the render. Amounts are printed as "Rs.".
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

/** "clinic plan — 1yr" -> "Clinic plan - 1 year" */
function tidyDescription(value: string | null): string {
  const base = safe(value) || 'Subscription payment'
  const spelled = base.replace(
    /(\d+)\s?yr\b/gi,
    (_m, n: string) => `${n} year${n === '1' ? '' : 's'}`
  )
  return spelled.charAt(0).toUpperCase() + spelled.slice(1)
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
      'id, clinic_id, subscription_id, invoice_number, description, subtotal_paise, gst_mode, gst_rate_bp, gst_amount_paise, total_paise, seller_gstin, buyer_gstin, status, issued_at, paid_at, razorpay_payment_id'
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
    .select('name, address, city, state, postal_code, email')
    .eq('id', invoice.clinic_id)
    .maybeSingle()

  if (clinicError) {
    console.error('[invoice pdf] clinic lookup failed:', clinicError)
  }

  // End of the subscription term this invoice belongs to
  let validUntil: string | null = null
  if (invoice.subscription_id) {
    const { data: sub, error: subError } = await supabase
      .from('subscriptions')
      .select('ends_at')
      .eq('id', invoice.subscription_id)
      .maybeSingle()

    if (subError) {
      console.error('[invoice pdf] subscription lookup failed:', subError)
    }
    validUntil = sub?.ends_at ?? null
  }

  const isPaid = invoice.status === 'paid'
  const totalPaise: number = invoice.total_paise
  const paidPaise = isPaid ? totalPaise : 0
  const outstandingPaise = totalPaise - paidPaise

  const pdf = await PDFDocument.create()
  const W = 595.28
  const H = 841.89
  const page = pdf.addPage([W, H]) // A4
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)

  const left = 50
  const right = 545

  const teal = rgb(0.05, 0.52, 0.52)
  const tealDark = rgb(0.0, 0.3, 0.3)
  const tealLabel = rgb(0.0, 0.45, 0.45)
  const tealWatermark = rgb(0.22, 0.62, 0.62)
  const tealStrip = rgb(0.9, 0.97, 0.97)
  const green = rgb(0.09, 0.5, 0.2)
  const ink = rgb(0.1, 0.1, 0.1)
  const muted = rgb(0.4, 0.4, 0.4)
  const greyHead = rgb(0.91, 0.91, 0.91)
  const hairline = rgb(0.85, 0.85, 0.85)
  const white = rgb(1, 1, 1)

  type Font = typeof regular

  const text = (
    value: string,
    x: number,
    y: number,
    size = 10,
    font: Font = regular,
    color = ink
  ) => page.drawText(safe(value), { x, y, size, font, color })

  const textRight = (
    value: string,
    xRight: number,
    y: number,
    size = 10,
    font: Font = regular,
    color = ink
  ) => {
    const s = safe(value)
    text(s, xRight - font.widthOfTextAtSize(s, size), y, size, font, color)
  }

  const rule = (y: number, x1 = left, x2 = right, color = hairline, thickness = 0.7) =>
    page.drawLine({
      start: { x: x1, y },
      end: { x: x2, y },
      thickness,
      color,
    })

  /** Small teal caps label with a teal underline, like the receipt sections. */
  const sectionLabel = (label: string, y: number, x1 = left, x2 = right) => {
    text(label, x1, y, 8, bold, tealLabel)
    rule(y - 7, x1, x2, teal, 1)
  }

  // ───────────────────────── Header band ─────────────────────────
  page.drawRectangle({ x: 0, y: H - 130, width: W, height: 130, color: teal })

  textRight('INVOICE', right, H - 88, 46, bold, tealWatermark)

  text(SELLER.name, left, H - 46, 22, bold, white)

  const headerLines: string[] = [...SELLER.addressLines]
  const contactLine = [SELLER.phone, SELLER.email].filter(Boolean).join('  |  ')
  if (contactLine) headerLines.push(contactLine)
  if (invoice.seller_gstin) headerLines.push(`GSTIN: ${invoice.seller_gstin}`)

  let headerY = H - 66
  for (const l of headerLines.slice(0, 4)) {
    text(l, left, headerY, 9, regular, white)
    headerY -= 13
  }

  // ───────────────────────── Meta strip ─────────────────────────
  const stripTop = H - 130
  page.drawRectangle({ x: 0, y: stripTop - 52, width: W, height: 52, color: tealStrip })

  text('INVOICE NO.', left, stripTop - 17, 8, bold, tealLabel)
  text(invoice.invoice_number, left, stripTop - 39, 15, bold, tealDark)

  if (invoice.razorpay_payment_id) {
    text(`PAYMENT ID: ${invoice.razorpay_payment_id}`, 215, stripTop - 34, 8.5, regular, muted)
  }

  textRight('DATE', right, stripTop - 17, 8, bold, tealLabel)
  textRight(dateIST(invoice.issued_at), right, stripTop - 39, 13, bold, ink)

  // ─────────────────── Billed to / Valid until ───────────────────
  const colGap = 24
  const colW = (right - left - colGap) / 2
  const leftColX1 = left
  const leftColX2 = left + colW
  const rightColX1 = left + colW + colGap
  const rightColX2 = right

  const secY = H - 220
  sectionLabel('BILLED TO', secY, leftColX1, leftColX2)
  sectionLabel('VALID UNTIL', secY, rightColX1, rightColX2)

  text(clinic?.name ?? 'Clinic', leftColX1, secY - 28, 14, bold)
  let billY = secY - 44
  const cityLine = [clinic?.city, clinic?.state, clinic?.postal_code].filter(Boolean).join(', ')
  for (const l of [clinic?.address, cityLine, clinic?.email]) {
    if (l && safe(l)) {
      text(l, leftColX1, billY, 9, regular, muted)
      billY -= 13
    }
  }
  if (invoice.buyer_gstin) {
    text(`GSTIN: ${invoice.buyer_gstin}`, leftColX1, billY, 9, regular, muted)
  }

  text(dateIST(validUntil), rightColX1, secY - 28, 14, bold)
  text('End of the subscription term', rightColX1, secY - 44, 9, regular, muted)

  // ───────────────────────── Itemised bill ─────────────────────────
  const itemLabelY = H - 345
  sectionLabel('ITEMISED BILL', itemLabelY)

  const headTop = itemLabelY - 14
  page.drawRectangle({
    x: left,
    y: headTop - 22,
    width: right - left,
    height: 22,
    color: greyHead,
  })
  const headBase = headTop - 15
  text('DESCRIPTION', left + 10, headBase, 8, bold, muted)
  textRight('QTY', 340, headBase, 8, bold, muted)
  textRight('UNIT PRICE', 440, headBase, 8, bold, muted)
  textRight('TOTAL', right - 10, headBase, 8, bold, muted)

  const rowBase = headTop - 22 - 22
  text(tidyDescription(invoice.description), left + 10, rowBase, 11)
  textRight('1', 340, rowBase, 10, regular, muted)
  textRight(rupees(invoice.subtotal_paise), 440, rowBase, 10, regular, muted)
  textRight(rupees(invoice.subtotal_paise), right - 10, rowBase, 10, bold)
  rule(rowBase - 12)

  let cursor = rowBase - 32

  // GST lines only appear once CURAKIN is registered and charging tax
  if (invoice.gst_amount_paise > 0) {
    textRight(`Subtotal   ${rupees(invoice.subtotal_paise)}`, right - 10, cursor, 10)
    cursor -= 16
    const pct = (invoice.gst_rate_bp / 100).toFixed(0)
    textRight(`GST @ ${pct}%   ${rupees(invoice.gst_amount_paise)}`, right - 10, cursor, 10)
    cursor -= 16
  }

  // ───────────────────────── Summary box ─────────────────────────
  const boxTop = cursor - 4
  const boxH = 78
  const boxY = boxTop - boxH

  page.drawRectangle({
    x: left,
    y: boxY,
    width: right - left,
    height: boxH,
    color: rgb(0.96, 0.97, 0.97),
    borderColor: hairline,
    borderWidth: 0.7,
  })
  page.drawRectangle({ x: left, y: boxY, width: 4, height: boxH, color: teal })

  page.drawLine({
    start: { x: 215, y: boxY + 12 },
    end: { x: 215, y: boxTop - 12 },
    thickness: 0.7,
    color: hairline,
  })
  page.drawLine({
    start: { x: 380, y: boxY + 12 },
    end: { x: 380, y: boxTop - 12 },
    thickness: 0.7,
    color: hairline,
  })

  text('AMOUNT CHARGED', 70, boxTop - 22, 8, bold, muted)
  text(rupees(totalPaise), 70, boxTop - 48, 17, bold)

  text('AMOUNT PAID', 232, boxTop - 22, 8, bold, muted)
  text(rupees(paidPaise), 232, boxTop - 48, 17, bold, paidPaise > 0 ? green : ink)

  text('OUTSTANDING', 397, boxTop - 22, 8, bold, muted)
  text(
    outstandingPaise > 0 ? rupees(outstandingPaise) : 'Nil',
    397,
    boxTop - 48,
    17,
    bold,
    outstandingPaise > 0 ? ink : green
  )

  if (isPaid && outstandingPaise === 0) {
    const badgeW = 98
    const badgeX = right - badgeW - 10
    page.drawRectangle({
      x: badgeX,
      y: boxY + 8,
      width: badgeW,
      height: 18,
      color: rgb(0.11, 0.55, 0.25),
    })
    const badgeText = 'PAID IN FULL'
    const bw = bold.widthOfTextAtSize(badgeText, 8)
    text(badgeText, badgeX + (badgeW - bw) / 2, boxY + 14, 8, bold, white)
  }

  // ───────────────────────── Payment history ─────────────────────────
  if (invoice.paid_at) {
    const histLabelY = boxY - 34
    sectionLabel('PAYMENT HISTORY', histLabelY)

    const hTop = histLabelY - 14
    page.drawRectangle({
      x: left,
      y: hTop - 22,
      width: right - left,
      height: 22,
      color: greyHead,
    })
    const hBase = hTop - 15
    text('DATE', left + 10, hBase, 8, bold, muted)
    text('METHOD', 160, hBase, 8, bold, muted)
    text('REFERENCE', 290, hBase, 8, bold, muted)
    textRight('AMOUNT', right - 10, hBase, 8, bold, muted)

    const hRow = hTop - 22 - 22
    text(dateIST(invoice.paid_at), left + 10, hRow, 10)
    text('Online (Razorpay)', 160, hRow, 10)
    text(invoice.razorpay_payment_id ?? '-', 290, hRow, 9, regular, muted)
    textRight(rupees(totalPaise), right - 10, hRow, 10, bold)
    rule(hRow - 12)
  }

  // ───────────────────────── Footer ─────────────────────────
  text('This is a computer-generated invoice and does not require a signature.', left, 40, 8, regular, muted)
  page.drawRectangle({ x: 0, y: 0, width: W, height: 8, color: teal })

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