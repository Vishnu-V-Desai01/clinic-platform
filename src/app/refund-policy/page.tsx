import Link from 'next/link'
import { GRACE_PERIOD_DAYS, TRIAL_DAYS } from '@/features/billing/pricing'

export const metadata = {
  title: 'Refund and Cancellation Policy | CURAKIN HealthTech',
}

const EFFECTIVE_DATE = '1 November 2026'

const CONTACT = {
  email: 'curakinhealth@gmail.com',
  phone: '+91 78996 75747',
  address: 'T-5-247, R.T.P.S Colony, Shaktinagar, Raichur, Karnataka, India',
}

const FULL_REFUND_DAYS = 7
const PARTIAL_REFUND_DAYS = 30
const PARTIAL_REFUND_PERCENT = 50
const REVIEW_BUSINESS_DAYS = 3
const PAYOUT_BUSINESS_DAYS = 7

interface Section {
  title: string
  paragraphs?: string[]
  bullets?: string[]
}

const SECTIONS: Section[] = [
  {
    title: '1. Free trial',
    paragraphs: [
      `Every new clinic gets a ${TRIAL_DAYS}-day free trial. No payment details are needed to start. If you do not buy a plan before the trial ends, your account becomes view-only: you can still see your records, but you cannot create new records.`,
    ],
  },
  {
    title: '2. How plans are billed',
    paragraphs: [
      'You pay once, in Indian rupees, for the term you choose (1, 3 or 5 years). Payments are processed by Razorpay. Your plan does not renew automatically, and we never charge your payment method again unless you choose to buy.',
      'An invoice is generated for every payment and can be downloaded from the Billing page in your account.',
    ],
  },
  {
    title: '3. Cancellation',
    paragraphs: [
      'Because plans do not renew automatically, there is nothing to cancel. Your plan stays active until the end of the term you paid for.',
      `After your plan ends, you have a ${GRACE_PERIOD_DAYS}-day grace period with full access. After that your account becomes view-only until you renew: you can still see and edit existing records, but you cannot create new ones. To close your account completely, email ${CONTACT.email}. How we keep and delete your data is described in our Terms of Service and Privacy Policy.`,
    ],
  },
  {
    title: '4. Refunds',
    paragraphs: [
      'Refunds are based on the amount you paid for the purchase and on the number of days since the payment was captured. Each purchase has its own refund period, so a renewal or an extra-seat purchase starts a new one.',
    ],
    bullets: [
      `Within ${FULL_REFUND_DAYS} days of payment: full refund of the amount you paid.`,
      `From day ${FULL_REFUND_DAYS + 1} to day ${PARTIAL_REFUND_DAYS} after payment: refund of ${PARTIAL_REFUND_PERCENT}% of the amount you paid.`,
      `After ${PARTIAL_REFUND_DAYS} days: no refund. We do not refund the unused part of a term. This applies to 1, 3 and 5-year plans.`,
      'If we charged you the wrong amount, charged you twice for the same purchase, or a failure on our side stopped you from using the service and we could not fix it within a reasonable time, we will refund the affected amount in full, whenever it is reported.',
      'When a refund is approved, the plan it relates to ends immediately and your clinic account becomes view-only (you can still see and edit existing records but cannot create new ones).',
    ],
  },
  {
    title: '5. Extra doctor seats',
    paragraphs: [
      `Extra seats follow the same rules as plans: a full refund within ${FULL_REFUND_DAYS} days of buying them, ${PARTIAL_REFUND_PERCENT}% from day ${FULL_REFUND_DAYS + 1} to day ${PARTIAL_REFUND_DAYS}, and no refund after that. A refunded seat stops working immediately. Seats also end when the plan they were bought for ends.`,
    ],
  },
  {
    title: '6. Failed or duplicate payments',
    paragraphs: [
      'If money was debited from your account but your plan did not activate, email us with the payment reference. We will activate the plan or refund the amount.',
      'If a payment fails at the bank, the bank or Razorpay normally returns the amount to your account within 5 to 7 business days. You do not need to contact us unless it takes longer.',
    ],
  },
  {
    title: '7. How to request a refund',
    paragraphs: [
      `Email ${CONTACT.email} from the address registered on your clinic account. Include your clinic name and the invoice number or payment reference. We review requests within ${REVIEW_BUSINESS_DAYS} business days.`,
      `Approved refunds go back to the original payment method within ${PAYOUT_BUSINESS_DAYS} business days. Your bank may take a few more days to show the credit.`,
    ],
  },
  {
    title: '8. Changing plans',
    paragraphs: [
      'You can add doctor seats at any time from the Billing page. Moving to a different plan during a term is not yet available online; contact us and we will help.',
    ],
  },
  {
    title: '9. Contact',
    bullets: [
      `Email: ${CONTACT.email}`,
      `Phone: ${CONTACT.phone}`,
      `Address: ${CONTACT.address}`,
    ],
  },
]

export default function RefundPolicyPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-8 px-4 py-12">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Refund and Cancellation Policy</h1>
        <p className="text-sm text-muted-foreground">CURAKIN HealthTech</p>
        <p className="text-sm text-muted-foreground">Effective from {EFFECTIVE_DATE}</p>
      </header>

      {SECTIONS.map((section) => (
        <section key={section.title} className="space-y-3">
          <h2 className="text-lg font-semibold">{section.title}</h2>
          {section.paragraphs?.map((p) => (
            <p key={p} className="text-sm leading-relaxed text-muted-foreground">
              {p}
            </p>
          ))}
          {section.bullets && (
            <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
              {section.bullets.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          )}
        </section>
      ))}

      <footer className="flex flex-wrap gap-4 border-t pt-6 text-sm text-muted-foreground">
        <Link href="/pricing" className="underline underline-offset-4">
          Pricing
        </Link>
        <Link href="/terms" className="underline underline-offset-4">
          Terms of Service
        </Link>
        <Link href="/privacy" className="underline underline-offset-4">
          Privacy Policy
        </Link>
      </footer>
    </main>
  )
}