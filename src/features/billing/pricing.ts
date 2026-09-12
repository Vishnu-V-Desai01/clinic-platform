import type {
  GstMode,
  PriceQuote,
  SelfServeTier,
  SubscriptionTerm,
  SubscriptionTier,
} from './types';

/**
 * PRICING — single source of truth.
 *
 * Base model: flat per-clinic tiers differentiated by doctor count.
 * Every tier includes every feature (patient portal, care plans, reminders,
 * analytics, pharmacy) — there is no feature gating.
 *
 * SEAT ADD-ONS (added later, see git history for the original "no add-on
 * pricing" decision this superseded): Solo and Clinic tiers allow buying
 * extra doctor seats beyond the included limit, at a flat per-seat annual
 * rate. Group is intentionally excluded — a clinic outgrowing 10 doctors
 * moves to Enterprise instead of stacking add-ons indefinitely.
 */

/** Undiscounted tier price per year, in paise. */
export const TIER_ANNUAL_PAISE: Readonly<Record<SelfServeTier, number>> = Object.freeze({
  solo: 1_400_000, // ₹14,000/yr — 1 doctor
  clinic: 2_800_000, // ₹28,000/yr — up to 4 doctors
  group: 6_000_000, // ₹60,000/yr — up to 10 doctors
});

/** Doctor seat limits included in the base tier price. `null` = unlimited (enterprise, negotiated). */
export const TIER_DOCTOR_LIMITS: Readonly<Record<SubscriptionTier, number | null>> =
  Object.freeze({
    solo: 1,
    clinic: 4,
    group: 10,
    enterprise: null,
  });

/**
 * Per-seat annual add-on price, in paise. Only tiers present in this map
 * support add-on seats at all — Group and Enterprise are absent on purpose.
 */
export const SEAT_ADDON_ANNUAL_PAISE: Readonly<Partial<Record<SelfServeTier, number>>> =
  Object.freeze({
    solo: 600_000, // ₹6,000/yr per additional seat
    clinic: 700_000, // ₹7,000/yr per additional seat
  });

/** Number of years covered by each term. */
export const TERM_YEARS: Readonly<Record<SubscriptionTerm, number>> = Object.freeze({
  '1yr': 1,
  '3yr': 3,
  '5yr': 5,
});

/**
 * Prepayment discount in basis points, applied to the TOTAL for the term.
 * 1000 bp = 10%. Deliberately no 10-year term: too much forward liability
 * for a young company. Also applied to seat add-ons purchased at initial
 * checkout, for consistency with the base tier's prepay incentive — but
 * NOT applied to mid-subscription (prorated) seat purchases, since those
 * are inherently a partial-year charge already.
 */
export const TERM_DISCOUNT_BP: Readonly<Record<SubscriptionTerm, number>> = Object.freeze({
  '1yr': 0,
  '3yr': 1000, // 10% off the total
  '5yr': 2000, // 20% off the total
});

/** Free trial length. */
export const TRIAL_DAYS = 14;

/** Days after current_period_end before 'past_due' becomes 'expired'. */
export const GRACE_PERIOD_DAYS = 7;

/** Tier a new clinic lands on if it does not pick one at signup. */
export const DEFAULT_TRIAL_TIER: SelfServeTier = 'clinic';

/**
 * Doctor ceiling during trial. Not a billing limit — purely a guard so a
 * trial cannot be used indefinitely as a free Group plan.
 */
export const TRIAL_DOCTOR_CAP = 10;

/**
 * ---------------------------------------------------------------
 * GST CONFIGURATION
 * ---------------------------------------------------------------
 * CURAKIN is not GST-registered yet, so invoices carry no tax line and
 * the listed price is final.
 *
 * On registration, set CURAKIN_GSTIN and flip GST_MODE to 'exclusive'
 * (per the decision that prices become tax-exclusive at that point).
 *
 * Issued invoices SNAPSHOT their tax treatment into the invoices table.
 * Changing these constants therefore affects only future invoices and can
 * never retroactively alter an invoice already sent to a clinic.
 */
export const CURAKIN_GSTIN: string | null = null;
export const GST_MODE: GstMode = 'none';
export const GST_RATE_BP = 1800; // 18% on SaaS, applied only when registered

/**
 * Applies a basis-point rate to a paise amount using integer arithmetic only.
 *
 * Floating point is avoided deliberately: `0.1 * 4_200_000` is not exactly
 * 420000 in IEEE-754, and a sub-rupee drift on an invoice is a real defect.
 * Math.round on the integer quotient gives banker-free half-up rounding to
 * the nearest paisa.
 */
export function applyBasisPoints(amountPaise: number, bp: number): number {
  return Math.round((amountPaise * bp) / 10_000);
}

export function isSelfServeTier(tier: SubscriptionTier): tier is SelfServeTier {
  return tier === 'solo' || tier === 'clinic' || tier === 'group';
}

/** Whether this tier supports buying add-on seats at all. */
export function seatAddonSupported(tier: SubscriptionTier): tier is 'solo' | 'clinic' {
  return tier === 'solo' || tier === 'clinic';
}

/** Per-seat annual add-on price for a tier, or null if unsupported. */
export function getSeatAddonAnnualPaise(tier: SubscriptionTier): number | null {
  if (!seatAddonSupported(tier)) return null;
  return SEAT_ADDON_ANNUAL_PAISE[tier] ?? null;
}

/**
 * Computes the exact amount to charge for a tier + term.
 *
 * This is the single authority on price. The client never sends an amount;
 * the server calls this and hands the result to Razorpay.
 */
export function computePrice(
  tier: SubscriptionTier,
  term: SubscriptionTerm,
): PriceQuote {
  if (!isSelfServeTier(tier)) {
    return { kind: 'contact_sales', tier: 'enterprise', term };
  }

  const years = TERM_YEARS[term];
  const discountBp = TERM_DISCOUNT_BP[term];

  const listPaise = TIER_ANNUAL_PAISE[tier] * years;
  const discountPaise = applyBasisPoints(listPaise, discountBp);
  const subtotalPaise = listPaise - discountPaise;

  const gstAmountPaise =
    GST_MODE === 'exclusive' ? applyBasisPoints(subtotalPaise, GST_RATE_BP) : 0;

  const totalPaise =
    GST_MODE === 'exclusive' ? subtotalPaise + gstAmountPaise : subtotalPaise;

  return {
    kind: 'priced',
    tier,
    term,
    years,
    listPaise,
    discountPaise,
    discountBp,
    subtotalPaise,
    gstMode: GST_MODE,
    gstRateBp: GST_MODE === 'exclusive' ? GST_RATE_BP : 0,
    gstAmountPaise,
    totalPaise,
  };
}

/**
 * Full-term price for N add-on seats bought alongside a fresh subscription
 * checkout. Same term discount as the base tier applies. Returns 0 if the
 * tier doesn't support add-ons or seats <= 0.
 */
export function computeSeatAddonPriceForNewTerm(
  tier: SubscriptionTier,
  term: SubscriptionTerm,
  seats: number,
): number {
  const perSeatAnnual = getSeatAddonAnnualPaise(tier);
  if (perSeatAnnual === null || seats <= 0) return 0;

  const years = TERM_YEARS[term];
  const discountBp = TERM_DISCOUNT_BP[term];

  const listPaise = perSeatAnnual * years * seats;
  const discountPaise = applyBasisPoints(listPaise, discountBp);
  return listPaise - discountPaise;
}

/**
 * Prorated price for N add-on seats bought mid-subscription, based on days
 * remaining until the current term ends. No multi-year discount applies —
 * proration is inherently a partial-year charge, not a prepay commitment.
 */
export function computeSeatAddonProratedPrice(
  tier: SubscriptionTier,
  seats: number,
  termEndsAt: Date,
  now: Date = new Date(),
): number {
  const perSeatAnnual = getSeatAddonAnnualPaise(tier);
  if (perSeatAnnual === null || seats <= 0) return 0;

  const msRemaining = Math.max(0, termEndsAt.getTime() - now.getTime());
  const daysRemaining = Math.ceil(msRemaining / (1000 * 60 * 60 * 24));
  const perSeatProrated = Math.round((perSeatAnnual / 365) * daysRemaining);
  return perSeatProrated * seats;
}

/** Seat limit included in the base tier price. `null` means unlimited. */
export function getDoctorLimit(tier: SubscriptionTier): number | null {
  return TIER_DOCTOR_LIMITS[tier];
}

/**
 * Effective doctor limit including purchased add-on seats. `null` means
 * unlimited (enterprise). Group ignores addonSeats — it has no add-on
 * option, so its limit is always the flat 10.
 */
export function getEffectiveDoctorLimit(
  tier: SubscriptionTier,
  addonSeats: number,
): number | null {
  const base = getDoctorLimit(tier);
  if (base === null) return null;
  if (!seatAddonSupported(tier)) return base;
  return base + Math.max(0, addonSeats);
}

/**
 * Whether a clinic with `doctorCount` doctors can sit on `tier` given its
 * base limit alone (no add-ons). Used to block over-limit downgrades and
 * to disable tier cards at checkout.
 */
export function tierFitsDoctorCount(
  tier: SubscriptionTier,
  doctorCount: number,
): boolean {
  const limit = getDoctorLimit(tier);
  return limit === null || doctorCount <= limit;
}

/**
 * Whether a clinic with `doctorCount` doctors fits on `tier` once
 * `addonSeats` extra seats are included. This is the authoritative check
 * for checkout — always use this (not tierFitsDoctorCount alone) once
 * add-on seats are part of the flow.
 */
export function fitsEffectiveDoctorCount(
  tier: SubscriptionTier,
  addonSeats: number,
  doctorCount: number,
): boolean {
  const limit = getEffectiveDoctorLimit(tier, addonSeats);
  return limit === null || doctorCount <= limit;
}

/**
 * Formats integer paise as Indian-locale rupees.
 *
 * Deliberately separate from the existing formatINR(), which takes RUPEES
 * (the `payments` table stores numeric(10,2)). Keeping two named functions
 * makes a wrong call a compile-time-visible mistake rather than a silent
 * 100x error on an invoice.
 */
export function formatPaise(paise: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(paise / 100);
}