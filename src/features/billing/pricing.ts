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
 * Locked model: flat per-clinic tiers differentiated by doctor count only.
 * Every tier includes every feature (patient portal, care plans, reminders,
 * analytics, pharmacy). There is no feature gating and no add-on pricing.
 *
 * A clinic that outgrows its doctor limit upgrades tier; it never pays a
 * per-seat surcharge.
 */

/** Undiscounted price per year, in paise. */
export const TIER_ANNUAL_PAISE: Readonly<Record<SelfServeTier, number>> = Object.freeze({
  solo: 1_400_000, // ₹14,000/yr — 1 doctor
  clinic: 2_800_000, // ₹28,000/yr — up to 4 doctors
  group: 6_000_000, // ₹60,000/yr — up to 10 doctors
});

/** Doctor seat limits. `null` = unlimited (enterprise, negotiated). */
export const TIER_DOCTOR_LIMITS: Readonly<Record<SubscriptionTier, number | null>> =
  Object.freeze({
    solo: 1,
    clinic: 4,
    group: 10,
    enterprise: null,
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
 * for a young company.
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
function applyBasisPoints(amountPaise: number, bp: number): number {
  return Math.round((amountPaise * bp) / 10_000);
}

export function isSelfServeTier(tier: SubscriptionTier): tier is SelfServeTier {
  return tier === 'solo' || tier === 'clinic' || tier === 'group';
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

/** Seat limit for a tier. `null` means unlimited. */
export function getDoctorLimit(tier: SubscriptionTier): number | null {
  return TIER_DOCTOR_LIMITS[tier];
}

/**
 * Whether a clinic with `doctorCount` doctors can sit on `tier`.
 * Used both to block over-limit downgrades and to disable tier cards at
 * checkout when a trial clinic has already added more doctors than fit.
 */
export function tierFitsDoctorCount(
  tier: SubscriptionTier,
  doctorCount: number,
): boolean {
  const limit = getDoctorLimit(tier);
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