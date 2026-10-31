import Link from 'next/link'
import { Check } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  GST_MODE,
  MAX_ADDON_SEATS,
  SEAT_ADDON_ANNUAL_PAISE,
  TRIAL_DAYS,
  computePrice,
  formatPaise,
} from '@/features/billing/pricing'
import type { SelfServeTier, SubscriptionTerm } from '@/features/billing/types'

export const metadata = {
  title: 'Pricing | CURAKIN HealthTech',
  description:
    'Simple flat-fee pricing for clinics. Every plan includes every feature; plans differ only by the number of doctors.',
}

const TIERS: { tier: SelfServeTier; name: string; doctors: string; note?: string }[] = [
  { tier: 'solo', name: 'Solo', doctors: '1 doctor' },
  { tier: 'clinic', name: 'Clinic', doctors: 'Up to 4 doctors' },
  {
    tier: 'group',
    name: 'Group',
    doctors: 'Up to 10 doctors',
    note: 'Includes onboarding and priority support',
  },
]

const TERMS: { term: SubscriptionTerm; label: string }[] = [
  { term: '1yr', label: '1 year' },
  { term: '3yr', label: '3 years' },
  { term: '5yr', label: '5 years' },
]

const FEATURES = [
  'Patient records and care plans',
  'Appointments and follow-ups',
  'Payments and receipts',
  'WhatsApp reminders for appointments and medicines',
  'Pharmacy module',
  'Patient portal',
  'Analytics dashboard',
  'Unlimited staff accounts',
]

const CONTACT_EMAIL = '[ADD SALES EMAIL]'

export default function PricingPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-12 space-y-12">
      <header className="space-y-3 text-center">
        <h1 className="text-4xl font-bold tracking-tight">Simple pricing for clinics</h1>
        <p className="text-muted-foreground">
          One flat fee per clinic. Every plan includes every feature. Plans differ only by the
          number of doctors.
        </p>
        <p className="text-sm text-muted-foreground">
          Start with a {TRIAL_DAYS}-day free trial. No payment details needed.
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        {TIERS.map(({ tier, name, doctors, note }) => {
          const quote = computePrice(tier, '1yr')
          if (quote.kind !== 'priced') return null
          const seatPaise = SEAT_ADDON_ANNUAL_PAISE[tier as 'solo' | 'clinic']
          const maxSeats = MAX_ADDON_SEATS[tier as 'solo' | 'clinic']

          return (
            <Card key={tier}>
              <CardHeader>
                <CardTitle>{name}</CardTitle>
                <CardDescription>{doctors}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <span className="text-3xl font-bold">{formatPaise(quote.totalPaise)}</span>
                  <span className="text-sm text-muted-foreground"> / year</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  About {formatPaise(Math.round(quote.totalPaise / 12))} per month, paid once for
                  the year
                </p>
                {note && <p className="text-xs text-muted-foreground">{note}</p>}
                {seatPaise && maxSeats ? (
                  <p className="text-xs text-muted-foreground">
                    Need more doctors? Add up to {maxSeats} extra seat{maxSeats > 1 ? 's' : ''} at{' '}
                    {formatPaise(seatPaise)} per seat per year.
                  </p>
                ) : null}
              </CardContent>
            </Card>
          )
        })}
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Save with a longer term</h2>
        <p className="text-sm text-muted-foreground">
          Pay once for 3 or 5 years and save 10% or 20% on the total.
        </p>
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="p-3 font-medium">Plan</th>
                {TERMS.map(({ term, label }) => (
                  <th key={term} className="p-3 font-medium">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {TIERS.map(({ tier, name }) => (
                <tr key={tier} className="border-t">
                  <td className="p-3 font-medium">{name}</td>
                  {TERMS.map(({ term }) => {
                    const q = computePrice(tier, term)
                    return (
                      <td key={term} className="p-3">
                        {q.kind === 'priced' ? formatPaise(q.totalPaise) : '-'}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Included in every plan</h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {FEATURES.map((feature) => (
            <li key={feature} className="flex items-start gap-2 text-sm">
              <Check className="mt-0.5 size-4 shrink-0 text-primary" />
              {feature}
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2 rounded-md border p-6">
        <h2 className="text-xl font-semibold">More than 10 doctors?</h2>
        <p className="text-sm text-muted-foreground">
          For larger hospitals and groups we offer custom pricing. Write to {CONTACT_EMAIL}.
        </p>
      </section>

      <footer className="space-y-3 text-center text-sm text-muted-foreground">
        <p>
          All prices are in Indian rupees (INR).{' '}
          {GST_MODE === 'none'
            ? 'CURAKIN HealthTech is not currently registered for GST, so the price shown is the price you pay.'
            : 'Prices are exclusive of GST, which is added at checkout.'}{' '}
          Plans are paid once for the chosen term and do not renew automatically.
        </p>
                <p className="flex flex-wrap justify-center gap-4">
          <Link href="/refund-policy" className="underline underline-offset-4">
            Refund and cancellation policy
          </Link>
          <Link href="/terms" className="underline underline-offset-4">
            Terms of Service
          </Link>
          <Link href="/privacy" className="underline underline-offset-4">
            Privacy Policy
          </Link>
        </p>
        <Link
          href="/sign-up"
          className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Start your free trial
        </Link>
      </footer>
    </main>
  )
}