/**
 * Billing domain types.
 *
 * All monetary amounts in this feature are INTEGER PAISE.
 * (The `payments` table is the exception in this codebase — it stores
 * numeric(10,2) rupees. Never pass values between the two without conversion.)
 */

export const SUBSCRIPTION_TIERS = ['solo', 'clinic', 'group', 'enterprise'] as const;
export type SubscriptionTier = (typeof SUBSCRIPTION_TIERS)[number];

/** Tiers a clinic can buy without talking to sales. */
export const SELF_SERVE_TIERS = ['solo', 'clinic', 'group'] as const;
export type SelfServeTier = (typeof SELF_SERVE_TIERS)[number];

export const SUBSCRIPTION_TERMS = ['1yr', '3yr', '5yr'] as const;
export type SubscriptionTerm = (typeof SUBSCRIPTION_TERMS)[number];

export const SUBSCRIPTION_STATUSES = [
  'trialing',
  'active',
  'past_due',
  'cancelled',
  'expired',
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const GST_MODES = ['none', 'inclusive', 'exclusive'] as const;
export type GstMode = (typeof GST_MODES)[number];

/**
 * Result of a price computation.
 *
 * Discriminated on `kind` so that callers are forced by the compiler to
 * handle the enterprise case, rather than silently rendering a zero price.
 */
export type PriceQuote =
  | {
      kind: 'priced';
      tier: SelfServeTier;
      term: SubscriptionTerm;
      years: number;
      /** Undiscounted list price for the whole term. */
      listPaise: number;
      /** Amount saved by prepaying. Zero on 1yr. */
      discountPaise: number;
      /** Discount rate in basis points (1000 = 10%). */
      discountBp: number;
      /** Pre-tax amount actually charged for the term. */
      subtotalPaise: number;
      gstMode: GstMode;
      gstRateBp: number;
      gstAmountPaise: number;
      /** Final amount to charge. This is what goes to Razorpay. */
      totalPaise: number;
    }
  | {
      kind: 'contact_sales';
      tier: 'enterprise';
      term: SubscriptionTerm;
    };