'use client'

import { useState, useMemo } from 'react'
import { useTransition } from 'react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  AlertCircle,
  BadgeCheck,
  CalendarClock,
  Download,
  Loader2,
  Building2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createCheckoutOrderAction } from '@/features/billing/actions'
import type { SubscriptionTier, SubscriptionTerm } from '@/features/billing/types'

interface Subscription {
  tier: SubscriptionTier | 'enterprise'
  term: SubscriptionTerm
  status: 'trialing' | 'active' | 'past_due' | 'expired'
  trialEndsAt?: string
  renewsAt?: string
  dueAt?: string
}

interface Invoice {
  id: string
  date: string
  description: string
  amountPaise: number
  status: 'paid'
}

interface AdminBillingSettingsProps {
  subscription: Subscription
  invoices?: Invoice[]
}

interface TierDisplay {
  name: string
  doctorLimit: string
  description?: string
}

// Pricing (in paise)
const PRICING_PER_YEAR_PAISE: Record<SubscriptionTier | 'enterprise', number> = {
  solo: 1_400_000, // ₹14,000
  clinic: 2_800_000, // ₹28,000
  group: 6_000_000, // ₹60,000
  enterprise: 0,
}

// Term discount structure
const TERM_CONFIG: Record<SubscriptionTerm, { years: number; discount: number }> = {
  '1yr': { years: 1, discount: 0 },
  '3yr': { years: 3, discount: 0.1 },
  '5yr': { years: 5, discount: 0.2 },
}

// Tier metadata
const TIER_DISPLAY: Record<SubscriptionTier | 'enterprise', TierDisplay> = {
  solo: {
    name: 'Solo',
    doctorLimit: '1 doctor',
  },
  clinic: {
    name: 'Clinic',
    doctorLimit: 'Up to 4 doctors',
  },
  group: {
    name: 'Group',
    doctorLimit: 'Up to 10 doctors',
    description: 'Includes onboarding + priority support',
  },
  enterprise: {
    name: 'Enterprise',
    doctorLimit: '10+ doctors',
  },
}

// ─────────────────────────────────────────────────────────────
// FORMATTING HELPERS
// ─────────────────────────────────────────────────────────────

function formatPaise(paise: number): string {
  const rupees = paise / 100
  return `₹${rupees.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

function formatDate(isoString: string): string {
  const date = new Date(isoString)
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

function computeDaysLeft(endDate: string): number {
  const end = new Date(endDate)
  const now = new Date()
  const diffMs = end.getTime() - now.getTime()
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)))
}

function termTotalPaise(perYearPaise: number, term: SubscriptionTerm): number {
  const { years, discount } = TERM_CONFIG[term]
  return Math.round(perYearPaise * years * (1 - discount))
}

// ─────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────

export default function AdminBillingSettings({
  subscription,
  invoices = [],
}: AdminBillingSettingsProps) {
  const [selectedTier, setSelectedTier] = useState<SubscriptionTier | 'enterprise'>(
    subscription.tier
  )
  const [selectedTerm, setSelectedTerm] = useState<SubscriptionTerm>(
    subscription.status === 'trialing' ? '1yr' : subscription.term
  )
  const [isPending, startTransition] = useTransition()
  const [checkoutError, setCheckoutError] = useState<string | null>(null)

  // Compute trial/grace days
  const trialDaysLeft = useMemo(
    () => (subscription.trialEndsAt ? computeDaysLeft(subscription.trialEndsAt) : 0),
    [subscription.trialEndsAt]
  )

  const graceDaysLeft = useMemo(
    () =>
      subscription.dueAt
        ? Math.max(0, computeDaysLeft(subscription.dueAt))
        : 0,
    [subscription.dueAt]
  )

  // Compute totals — no pharmacy add-on, just tier pricing
  const tierPrice =
    selectedTier !== 'enterprise' ? PRICING_PER_YEAR_PAISE[selectedTier] : 0
  const tierTotal =
    selectedTier !== 'enterprise' ? termTotalPaise(tierPrice, selectedTerm) : 0
  const years = TERM_CONFIG[selectedTerm].years
  const discountPct = TERM_CONFIG[selectedTerm].discount * 100

  // Handle checkout — calls the server action
  const handleCheckout = async () => {
    if (selectedTier === 'enterprise' || isPending) return

    setCheckoutError(null)
    startTransition(async () => {
      const result = await createCheckoutOrderAction(
        selectedTier as SubscriptionTier,
        selectedTerm
      )

      if (!result.success) {
        setCheckoutError(result.error)
      }
      // On success, the action handles redirect to Razorpay checkout
    })
  }

  return (
    <div className="space-y-6">
      {/* STATUS BANNER */}
      <div className="space-y-3">
        {subscription.status === 'trialing' && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="pt-6 flex items-start gap-3">
              <CalendarClock className="size-5 text-primary flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground">
                  Trial Period Active
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {trialDaysLeft} day{trialDaysLeft !== 1 ? 's' : ''} remaining. Select a plan
                  below and pay to activate your subscription.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {subscription.status === 'active' && subscription.renewsAt && (
          <Card className="border-border bg-card">
            <CardContent className="pt-6 flex items-start gap-3">
              <BadgeCheck className="size-5 text-primary flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground">
                  Subscription Active
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Current plan:{' '}
                  <span className="font-medium">
                    {TIER_DISPLAY[subscription.tier as SubscriptionTier].name}
                  </span>{' '}
                  ({subscription.term})
                  · Renews {formatDate(subscription.renewsAt)}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {subscription.status === 'past_due' && subscription.dueAt && (
          <Card className="border-amber-300/50 bg-amber-50 dark:bg-amber-950/20">
            <CardContent className="pt-6 flex items-start gap-3">
              <AlertCircle className="size-5 text-amber-600 dark:text-amber-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                  Payment Overdue
                </p>
                <p className="text-xs text-amber-800 dark:text-amber-300 mt-1">
                  {graceDaysLeft} day{graceDaysLeft !== 1 ? 's' : ''} grace period remaining.
                  Renew your subscription to maintain uninterrupted access.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {subscription.status === 'expired' && (
          <Card className="border-destructive/30 bg-destructive/5">
            <CardContent className="pt-6 flex items-start gap-3">
              <AlertCircle className="size-5 text-destructive flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground">
                  Subscription Expired
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Your clinic is in view-only mode. Select a plan below and pay to restore full
                  access.
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* PLAN SELECTION */}
      <Card className="border border-border">
        <CardHeader>
          <CardTitle className="text-base">Select Your Plan</CardTitle>
          <CardDescription className="text-xs">
            All features included on every plan — plans differ only by doctor limit.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* TERM SELECTOR */}
          <div className="space-y-3">
            <p className="text-sm font-medium text-foreground">Subscription term</p>
            <Tabs
              value={selectedTerm}
              onValueChange={(v) => setSelectedTerm(v as SubscriptionTerm)}
              className="w-full"
            >
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="1yr">1 Year</TabsTrigger>
                <TabsTrigger value="3yr">3 Years (−10%)</TabsTrigger>
                <TabsTrigger value="5yr">5 Years (−20%)</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* TIER CARDS */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Solo */}
            <Card
              className={cn(
                'cursor-pointer transition-all border',
                selectedTier === 'solo'
                  ? 'ring-2 ring-primary border-primary'
                  : 'border-border hover:border-primary/50'
              )}
              onClick={() => setSelectedTier('solo')}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-sm">
                      {TIER_DISPLAY.solo.name}
                    </CardTitle>
                    <CardDescription className="text-xs mt-1">
                      {TIER_DISPLAY.solo.doctorLimit}
                    </CardDescription>
                  </div>
                  {selectedTier === 'solo' && subscription.tier === 'solo' && (
                    <Badge variant="secondary" className="text-xs">
                      Current
                    </Badge>
                  )}
                  {selectedTier === 'solo' && subscription.tier !== 'solo' && (
                    <Badge variant="secondary" className="text-xs">
                      Selected
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <div className="text-xl font-bold text-foreground">
                  {formatPaise(PRICING_PER_YEAR_PAISE.solo)}/yr
                </div>
                {selectedTerm !== '1yr' && (
                  <div className="text-xs text-muted-foreground">
                    {formatPaise(termTotalPaise(PRICING_PER_YEAR_PAISE.solo, selectedTerm))} for{' '}
                    {years} years · save {discountPct}%
                  </div>
                )}
                <div className="text-xs text-muted-foreground">
                  {formatPaise(PRICING_PER_YEAR_PAISE.solo / 12)}/mo
                </div>
              </CardContent>
            </Card>

            {/* Clinic */}
            <Card
              className={cn(
                'cursor-pointer transition-all border',
                selectedTier === 'clinic'
                  ? 'ring-2 ring-primary border-primary'
                  : 'border-border hover:border-primary/50'
              )}
              onClick={() => setSelectedTier('clinic')}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-sm">
                      {TIER_DISPLAY.clinic.name}
                    </CardTitle>
                    <CardDescription className="text-xs mt-1">
                      {TIER_DISPLAY.clinic.doctorLimit}
                    </CardDescription>
                  </div>
                  {selectedTier === 'clinic' && subscription.tier === 'clinic' && (
                    <Badge variant="secondary" className="text-xs">
                      Current
                    </Badge>
                  )}
                  {selectedTier === 'clinic' && subscription.tier !== 'clinic' && (
                    <Badge variant="secondary" className="text-xs">
                      Selected
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <div className="text-xl font-bold text-foreground">
                  {formatPaise(PRICING_PER_YEAR_PAISE.clinic)}/yr
                </div>
                {selectedTerm !== '1yr' && (
                  <div className="text-xs text-muted-foreground">
                    {formatPaise(termTotalPaise(PRICING_PER_YEAR_PAISE.clinic, selectedTerm))} for{' '}
                    {years} years · save {discountPct}%
                  </div>
                )}
                <div className="text-xs text-muted-foreground">
                  {formatPaise(PRICING_PER_YEAR_PAISE.clinic / 12)}/mo
                </div>
              </CardContent>
            </Card>

            {/* Group */}
            <Card
              className={cn(
                'cursor-pointer transition-all border',
                selectedTier === 'group'
                  ? 'ring-2 ring-primary border-primary'
                  : 'border-border hover:border-primary/50'
              )}
              onClick={() => setSelectedTier('group')}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-sm">
                      {TIER_DISPLAY.group.name}
                    </CardTitle>
                    <CardDescription className="text-xs mt-1">
                      {TIER_DISPLAY.group.doctorLimit}
                    </CardDescription>
                  </div>
                  {selectedTier === 'group' && subscription.tier === 'group' && (
                    <Badge variant="secondary" className="text-xs">
                      Current
                    </Badge>
                  )}
                  {selectedTier === 'group' && subscription.tier !== 'group' && (
                    <Badge variant="secondary" className="text-xs">
                      Selected
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <div className="text-xl font-bold text-foreground">
                  {formatPaise(PRICING_PER_YEAR_PAISE.group)}/yr
                </div>
                {selectedTerm !== '1yr' && (
                  <div className="text-xs text-muted-foreground">
                    {formatPaise(termTotalPaise(PRICING_PER_YEAR_PAISE.group, selectedTerm))} for{' '}
                    {years} years · save {discountPct}%
                  </div>
                )}
                <div className="text-xs text-muted-foreground">
                  {formatPaise(PRICING_PER_YEAR_PAISE.group / 12)}/mo
                </div>
                {TIER_DISPLAY.group.description && (
                  <div className="text-xs text-muted-foreground pt-1">
                    {TIER_DISPLAY.group.description}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Enterprise */}
            <Card
              className={cn(
                'cursor-pointer transition-all border md:col-span-3',
                selectedTier === 'enterprise'
                  ? 'ring-2 ring-primary border-primary'
                  : 'border-border hover:border-primary/50'
              )}
              onClick={() => setSelectedTier('enterprise')}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Building2 className="size-4" />
                      {TIER_DISPLAY.enterprise.name}
                    </CardTitle>
                    <CardDescription className="text-xs mt-1">
                      {TIER_DISPLAY.enterprise.doctorLimit}
                    </CardDescription>
                  </div>
                  {selectedTier === 'enterprise' && subscription.tier === 'enterprise' && (
                    <Badge variant="secondary" className="text-xs">
                      Current
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <div className="text-lg font-semibold text-foreground">
                  Custom pricing
                </div>
                <p className="text-xs text-muted-foreground">
                  Contact our sales team for a custom quote.
                </p>
              </CardContent>
            </Card>
          </div>

          {/* FEATURE PARITY NOTE */}
          <div className="text-xs text-muted-foreground px-1 flex items-start gap-2">
            <BadgeCheck className="size-4 flex-shrink-0 mt-0.5" />
            <div>
              <p>
                <span className="font-medium">Pharmacy module included</span> on all plans, plus
                unlimited staff members. Plans differ only by doctor limits and support level.
              </p>
            </div>
          </div>

          {/* CHECKOUT SUMMARY & BUTTON */}
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="pt-6 flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <p className="text-sm text-muted-foreground">Total:</p>
                <p className="text-2xl font-bold text-foreground">
                  {formatPaise(tierTotal)}
                </p>
                <p className="text-xs text-muted-foreground">
                  for {years} year{years > 1 ? 's' : ''} ({TIER_DISPLAY[selectedTier].name})
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  Prices are final (not GST-registered).
                </p>
              </div>

              {checkoutError && (
                <div className="text-xs text-destructive bg-destructive/10 p-2 rounded">
                  {checkoutError}
                </div>
              )}

              <Button
                onClick={handleCheckout}
                disabled={isPending || selectedTier === 'enterprise'}
                size="lg"
                className="w-full"
              >
                {isPending && <Loader2 className="size-4 mr-2 animate-spin" />}
                {isPending
                  ? 'Redirecting to payment…'
                  : selectedTier === 'enterprise'
                    ? 'Contact sales for Enterprise'
                    : 'Proceed to Payment'}
              </Button>
            </CardContent>
          </Card>
        </CardContent>
      </Card>

      {/* SUBSCRIPTION HISTORY / INVOICES */}
      <Card className="border border-border">
        <CardHeader>
          <CardTitle className="text-base">Subscription History</CardTitle>
          <CardDescription className="text-xs">Invoices and past payments</CardDescription>
        </CardHeader>
        <CardContent>
          {invoices && invoices.length > 0 ? (
            <div className="rounded-md border border-border overflow-hidden">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead className="text-xs font-semibold">Date</TableHead>
                    <TableHead className="text-xs font-semibold">Description</TableHead>
                    <TableHead className="text-xs font-semibold text-right">
                      Amount
                    </TableHead>
                    <TableHead className="text-xs font-semibold">Status</TableHead>
                    <TableHead className="text-xs font-semibold">Invoice</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((invoice) => (
                    <TableRow key={invoice.id} className="border-border hover:bg-muted/30">
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDate(invoice.date)}
                      </TableCell>
                      <TableCell className="text-xs text-foreground">
                        {invoice.description}
                      </TableCell>
                      <TableCell className="text-xs font-semibold text-right text-foreground">
                        {formatPaise(invoice.amountPaise)}
                      </TableCell>
                      <TableCell className="text-xs">
                        <Badge
                          variant="secondary"
                          className="bg-primary/15 text-primary border-0 text-xs"
                        >
                          {invoice.status === 'paid' ? 'Paid' : invoice.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled
                          className="h-6 w-6 p-0 opacity-50"
                          title="Invoice download coming soon"
                        >
                          <Download className="size-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 gap-2">
              <div className="text-sm text-muted-foreground text-center">
                No invoices yet — they&apos;ll appear here after your first payment.
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}