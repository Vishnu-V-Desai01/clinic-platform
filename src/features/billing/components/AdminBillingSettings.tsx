'use client'

import { useState, useMemo, useEffect } from 'react'
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
  Minus,
  Plus,
  UserPlus,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createCheckoutOrderAction, purchaseSeatAddonAction } from '@/features/billing/actions'
import {
  computePrice,
  computeSeatAddonPriceForNewTerm,
  formatPaise,
  getSeatAddonAnnualPaise,
  seatAddonSupported,
  tierFitsDoctorCount,
} from '@/features/billing/pricing'
import type { SubscriptionTier, SubscriptionTerm, SelfServeTier } from '@/features/billing/types'

declare global {
  interface Window {
    Razorpay: any
  }
}

interface Subscription {
  tier: SubscriptionTier
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
  /** Doctors currently on staff (active + suspended). Used to block
   *  selecting a tier/seat combo the clinic has already outgrown. */
  currentDoctorCount?: number
  /** Add-on seats already purchased and active for the current term.
   *  Only meaningful when subscription.status === 'active'. */
  activeAddonSeats?: number
}

interface TierDisplay {
  name: string
  doctorLimit: string
  description?: string
}

const SELF_SERVE_TIERS: SelfServeTier[] = ['solo', 'clinic', 'group']

const TIER_DISPLAY: Record<SubscriptionTier, TierDisplay> = {
  solo: { name: 'Solo', doctorLimit: '1 doctor' },
  clinic: { name: 'Clinic', doctorLimit: 'Up to 4 doctors' },
  group: {
    name: 'Group',
    doctorLimit: 'Up to 10 doctors',
    description: 'Includes onboarding + priority support',
  },
  enterprise: { name: 'Enterprise', doctorLimit: '10+ doctors' },
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

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.Razorpay) {
      resolve(true)
      return
    }
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.onload = () => resolve(true)
    script.onerror = () => resolve(false)
    document.body.appendChild(script)
  })
}

function openRazorpayCheckout(
  data: { orderId: string; amount: number; currency: string; keyId: string },
  description: string,
  onSuccess: () => void,
  onFail: (message: string) => void
) {
  const razorpayOptions = {
    key: data.keyId,
    amount: data.amount,
    currency: data.currency,
    order_id: data.orderId,
    name: 'CURAKIN HealthTech',
    description,
    handler: function () {
      setTimeout(onSuccess, 1500)
    },
    modal: {
      ondismiss: function () {},
    },
    theme: { color: '#0f766e' },
  }

  const rzp = new window.Razorpay(razorpayOptions)
  rzp.on('payment.failed', function (response: any) {
    onFail(`Payment failed: ${response.error?.description || 'Please try again.'}`)
  })
  rzp.open()
}

export default function AdminBillingSettings({
  subscription,
  invoices = [],
  currentDoctorCount = 0,
  activeAddonSeats = 0,
}: AdminBillingSettingsProps) {
  const [selectedTier, setSelectedTier] = useState<SubscriptionTier>(subscription.tier)
  const [selectedTerm, setSelectedTerm] = useState<SubscriptionTerm>(
    subscription.status === 'trialing' ? '1yr' : subscription.term
  )
  const [checkoutAddonSeats, setCheckoutAddonSeats] = useState(0)
  const [isPending, startTransition] = useTransition()
  const [checkoutError, setCheckoutError] = useState<string | null>(null)
  const [scriptReady, setScriptReady] = useState(false)

  // Separate state for the "buy more seats mid-subscription" card
  const [midTermSeats, setMidTermSeats] = useState(1)
  const [isMidTermPending, startMidTermTransition] = useTransition()
  const [midTermError, setMidTermError] = useState<string | null>(null)

  useEffect(() => {
    loadRazorpayScript().then(setScriptReady)
  }, [])

  // Reset the seat stepper whenever the tier changes away from one that
  // supports add-ons, so a stale seat count doesn't silently carry over
  // to a tier (like Group) that can't have add-ons.
  useEffect(() => {
    if (!seatAddonSupported(selectedTier)) {
      setCheckoutAddonSeats(0)
    }
  }, [selectedTier])

  const trialDaysLeft = useMemo(
    () => (subscription.trialEndsAt ? computeDaysLeft(subscription.trialEndsAt) : 0),
    [subscription.trialEndsAt]
  )

  const graceDaysLeft = useMemo(
    () => (subscription.dueAt ? Math.max(0, computeDaysLeft(subscription.dueAt)) : 0),
    [subscription.dueAt]
  )

  const quotesByTier = useMemo(() => {
    const map = {} as Record<SelfServeTier, ReturnType<typeof computePrice>>
    for (const tier of SELF_SERVE_TIERS) {
      map[tier] = computePrice(tier, selectedTerm)
    }
    return map
  }, [selectedTerm])

  const selectedQuote =
    selectedTier !== 'enterprise' ? quotesByTier[selectedTier as SelfServeTier] : null
  const selectedYears = selectedQuote?.kind === 'priced' ? selectedQuote.years : 0
  const selectedDiscountPct =
    selectedQuote?.kind === 'priced' ? selectedQuote.discountBp / 100 : 0

  const selectedAddonSupported = seatAddonSupported(selectedTier)
  const selectedAddonAnnualPaise = getSeatAddonAnnualPaise(selectedTier)
  const selectedAddonPaise =
    selectedTier !== 'enterprise'
      ? computeSeatAddonPriceForNewTerm(selectedTier, selectedTerm, checkoutAddonSeats)
      : 0

  const selectedBaseTotalPaise = selectedQuote?.kind === 'priced' ? selectedQuote.totalPaise : 0
  const selectedGrandTotalPaise = selectedBaseTotalPaise + selectedAddonPaise

  const selectedEffectiveLimit =
    selectedTier === 'enterprise'
      ? null
      : (selectedAddonSupported
          ? (TIER_DISPLAY[selectedTier].doctorLimit /* not numeric — use pricing fn below */, undefined)
          : undefined)

  // Base-limit fit is what tierFitsDoctorCount checks; effective fit
  // (including seats about to be purchased) is computed inline below
  // since it depends on checkoutAddonSeats which changes per render.
  const baseLimitFits =
    selectedTier === 'enterprise' ? true : tierFitsDoctorCount(selectedTier, currentDoctorCount)

  const effectiveLimitForSelection = (() => {
    if (selectedTier === 'enterprise') return null
    const base =
      selectedTier === 'solo' ? 1 : selectedTier === 'clinic' ? 4 : selectedTier === 'group' ? 10 : 0
    if (!selectedAddonSupported) return base
    return base + checkoutAddonSeats
  })()

  const selectionFits =
    effectiveLimitForSelection === null || currentDoctorCount <= effectiveLimitForSelection

  const handleCheckout = async () => {
    if (selectedTier === 'enterprise' || isPending || !selectionFits) return

    setCheckoutError(null)

    if (!scriptReady) {
      setCheckoutError('Payment gateway is still loading, please try again in a moment.')
      return
    }

    startTransition(async () => {
      const result = await createCheckoutOrderAction(
        selectedTier as SelfServeTier,
        selectedTerm,
        checkoutAddonSeats
      )

      if (!result.success) {
        setCheckoutError(result.error)
        return
      }

      openRazorpayCheckout(
        result.data,
        `${TIER_DISPLAY[selectedTier].name} plan — ${selectedTerm}${
          checkoutAddonSeats > 0 ? ` + ${checkoutAddonSeats} seat${checkoutAddonSeats > 1 ? 's' : ''}` : ''
        }`,
        () => window.location.reload(),
        (message) => setCheckoutError(message)
      )
    })
  }

  const handleMidTermPurchase = async () => {
    if (isMidTermPending || midTermSeats <= 0) return

    setMidTermError(null)

    if (!scriptReady) {
      setMidTermError('Payment gateway is still loading, please try again in a moment.')
      return
    }

    startMidTermTransition(async () => {
      const result = await purchaseSeatAddonAction(midTermSeats)

      if (!result.success) {
        setMidTermError(result.error)
        return
      }

      openRazorpayCheckout(
        result.data,
        `${midTermSeats} additional doctor seat${midTermSeats > 1 ? 's' : ''} (prorated)`,
        () => window.location.reload(),
        (message) => setMidTermError(message)
      )
    })
  }

  const canBuyMidTermSeats =
    subscription.status === 'active' && seatAddonSupported(subscription.tier)

  return (
    <div className="space-y-6">
      {/* STATUS BANNER */}
      <div className="space-y-3">
        {subscription.status === 'trialing' && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="pt-6 flex items-start gap-3">
              <CalendarClock className="size-5 text-primary flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground">Trial Period Active</p>
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
                <p className="text-sm font-semibold text-foreground">Subscription Active</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Current plan:{' '}
                  <span className="font-medium">{TIER_DISPLAY[subscription.tier].name}</span>{' '}
                  ({subscription.term})
                  {activeAddonSeats > 0 && (
                    <> · {activeAddonSeats} add-on seat{activeAddonSeats > 1 ? 's' : ''}</>
                  )}{' '}
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
                <p className="text-sm font-semibold text-foreground">Subscription Expired</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Your clinic is in view-only mode. Select a plan below and pay to restore full
                  access.
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* MID-SUBSCRIPTION SEAT PURCHASE */}
      {canBuyMidTermSeats && (
        <Card className="border border-border">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <UserPlus className="size-4" />
              Add Doctor Seats
            </CardTitle>
            <CardDescription className="text-xs">
              Buy extra seats now, prorated to the time remaining in your current term.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setMidTermSeats((s) => Math.max(1, s - 1))}
                  disabled={isMidTermPending}
                >
                  <Minus className="size-3" />
                </Button>
                <span className="w-8 text-center text-sm font-medium">{midTermSeats}</span>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setMidTermSeats((s) => s + 1)}
                  disabled={isMidTermPending}
                >
                  <Plus className="size-3" />
                </Button>
              </div>
              <div className="text-sm text-muted-foreground">
                seat{midTermSeats > 1 ? 's' : ''} × ₹
                {(getSeatAddonAnnualPaise(subscription.tier) ?? 0) / 100} /yr (prorated)
              </div>
            </div>

            {midTermError && (
              <div className="text-xs text-destructive bg-destructive/10 p-2 rounded">
                {midTermError}
              </div>
            )}

            <Button
              onClick={handleMidTermPurchase}
              disabled={isMidTermPending}
              variant="outline"
              className="w-full"
            >
              {isMidTermPending && <Loader2 className="size-4 mr-2 animate-spin" />}
              {isMidTermPending ? 'Processing…' : 'Buy Seats Now'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* PLAN SELECTION */}
      <Card className="border border-border">
        <CardHeader>
          <CardTitle className="text-base">Select Your Plan</CardTitle>
          <CardDescription className="text-xs">
            All features included on every plan — plans differ only by doctor limit.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
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

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {SELF_SERVE_TIERS.map((tier) => {
              const quote = quotesByTier[tier]
              if (quote.kind !== 'priced') return null
              const fits = tierFitsDoctorCount(tier, currentDoctorCount)
              const monthlyPaise = Math.round(quote.totalPaise / (quote.years * 12))

              return (
                <Card
                  key={tier}
                  className={cn(
                    'transition-all border',
                    !fits && 'opacity-50',
                    fits && 'cursor-pointer',
                    selectedTier === tier
                      ? 'ring-2 ring-primary border-primary'
                      : 'border-border hover:border-primary/50'
                  )}
                  onClick={() => fits && setSelectedTier(tier)}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-sm">{TIER_DISPLAY[tier].name}</CardTitle>
                        <CardDescription className="text-xs mt-1">
                          {TIER_DISPLAY[tier].doctorLimit}
                        </CardDescription>
                      </div>
                      {selectedTier === tier && subscription.tier === tier && (
                        <Badge variant="secondary" className="text-xs">
                          Current
                        </Badge>
                      )}
                      {selectedTier === tier && subscription.tier !== tier && (
                        <Badge variant="secondary" className="text-xs">
                          Selected
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-2">
                    <div className="text-xl font-bold text-foreground">
                      {formatPaise(quote.listPaise / quote.years)}/yr
                    </div>
                    {selectedTerm !== '1yr' && (
                      <div className="text-xs text-muted-foreground">
                        {formatPaise(quote.totalPaise)} for {quote.years} years · save{' '}
                        {quote.discountBp / 100}%
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground">
                      {formatPaise(monthlyPaise)}/mo
                    </div>
                    {seatAddonSupported(tier) && (
                      <div className="text-xs text-muted-foreground pt-1">
                        +{formatPaise(getSeatAddonAnnualPaise(tier) ?? 0)}/yr per extra seat
                      </div>
                    )}
                    {TIER_DISPLAY[tier].description && (
                      <div className="text-xs text-muted-foreground pt-1">
                        {TIER_DISPLAY[tier].description}
                      </div>
                    )}
                    {!fits && (
                      <div className="text-xs text-destructive pt-1">
                        Your clinic has more doctors than this plan allows.
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })}

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
                <div className="text-lg font-semibold text-foreground">Custom pricing</div>
                <p className="text-xs text-muted-foreground">
                  Contact our sales team for a custom quote.
                </p>
              </CardContent>
            </Card>
          </div>

          {/* SEAT ADD-ON STEPPER — only for tiers that support it */}
          {selectedAddonSupported && (
            <div className="flex items-center justify-between p-3 rounded-md bg-card border border-border">
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-foreground">
                  Add extra doctor seats
                </label>
                <p className="text-xs text-muted-foreground">
                  {formatPaise(selectedAddonAnnualPaise ?? 0)}/yr per seat, same term discount
                  applies.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setCheckoutAddonSeats((s) => Math.max(0, s - 1))}
                >
                  <Minus className="size-3" />
                </Button>
                <span className="w-6 text-center text-sm font-medium">{checkoutAddonSeats}</span>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setCheckoutAddonSeats((s) => s + 1)}
                >
                  <Plus className="size-3" />
                </Button>
              </div>
            </div>
          )}

          <div className="text-xs text-muted-foreground px-1 flex items-start gap-2">
            <BadgeCheck className="size-4 flex-shrink-0 mt-0.5" />
            <div>
              <p>
                <span className="font-medium">Pharmacy module included</span> on all plans, plus
                unlimited staff members. Plans differ only by doctor limits and support level.
              </p>
            </div>
          </div>

          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="pt-6 flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <p className="text-sm text-muted-foreground">Total:</p>
                <p className="text-2xl font-bold text-foreground">
                  {selectedTier === 'enterprise' ? 'Custom' : formatPaise(selectedGrandTotalPaise)}
                </p>
                {selectedTier !== 'enterprise' && (
                  <p className="text-xs text-muted-foreground">
                    for {selectedYears} year{selectedYears > 1 ? 's' : ''} (
                    {TIER_DISPLAY[selectedTier].name})
                    {checkoutAddonSeats > 0 &&
                      ` + ${checkoutAddonSeats} seat${checkoutAddonSeats > 1 ? 's' : ''}`}
                    {selectedDiscountPct > 0 && ` · ${selectedDiscountPct}% prepay discount applied`}
                  </p>
                )}
                <p className="text-xs text-muted-foreground mt-2">
                  Prices are final (not GST-registered).
                </p>
              </div>

              {!selectionFits && selectedTier !== 'enterprise' && (
                <div className="text-xs text-destructive bg-destructive/10 p-2 rounded">
                  This plan (with the selected add-on seats) supports fewer doctors than your
                  clinic currently has ({currentDoctorCount}). Add more seats or choose a higher
                  tier.
                </div>
              )}

              {checkoutError && (
                <div className="text-xs text-destructive bg-destructive/10 p-2 rounded">
                  {checkoutError}
                </div>
              )}

              <Button
                onClick={handleCheckout}
                disabled={isPending || selectedTier === 'enterprise' || !selectionFits}
                size="lg"
                className="w-full"
              >
                {isPending && <Loader2 className="size-4 mr-2 animate-spin" />}
                {isPending
                  ? 'Processing…'
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
                    <TableHead className="text-xs font-semibold text-right">Amount</TableHead>
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