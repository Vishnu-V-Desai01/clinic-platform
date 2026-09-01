/**
 * Prints every tier × term combination so the arithmetic can be checked
 * by hand before any UI or payment gateway is wired to it.
 *
 * Run:  npx tsx scripts/verify-pricing.ts
 */

import {
  computePrice,
  formatPaise,
  getDoctorLimit,
  TERM_YEARS,
} from '../src/features/billing/pricing';
import { SUBSCRIPTION_TERMS, SUBSCRIPTION_TIERS } from '../src/features/billing/types';

let failures = 0;

function check(label: string, actual: number, expected: number): void {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(
    `  ${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(28)} ` +
      `got ${String(actual).padStart(10)}  expected ${String(expected).padStart(10)}`,
  );
}

/** Hand-computed expected totals in paise, GST_MODE = 'none'. */
const EXPECTED: Record<string, number> = {
  'solo/1yr': 1_400_000, //  ₹14,000  =  14,000 x 1
  'solo/3yr': 3_780_000, //  ₹37,800  =  42,000 less 10%
  'solo/5yr': 5_600_000, //  ₹56,000  =  70,000 less 20%
  'clinic/1yr': 2_800_000, //  ₹28,000
  'clinic/3yr': 7_560_000, //  ₹75,600  =  84,000 less 10%
  'clinic/5yr': 11_200_000, // ₹1,12,000 = 1,40,000 less 20%
  'group/1yr': 6_000_000, //  ₹60,000
  'group/3yr': 16_200_000, // ₹1,62,000 = 1,80,000 less 10%
  'group/5yr': 24_000_000, // ₹2,40,000 = 3,00,000 less 20%
};

console.log('\nCURAKIN pricing verification\n' + '='.repeat(72) + '\n');

for (const tier of SUBSCRIPTION_TIERS) {
  const limit = getDoctorLimit(tier);
  console.log(
    `${tier.toUpperCase()}  (doctor limit: ${limit === null ? 'unlimited' : limit})`,
  );

  for (const term of SUBSCRIPTION_TERMS) {
    const quote = computePrice(tier, term);

    if (quote.kind === 'contact_sales') {
      console.log(`  ${term.padEnd(5)} contact sales — no self-serve price`);
      continue;
    }

    const perYear = quote.subtotalPaise / TERM_YEARS[term];

    console.log(
      `  ${term.padEnd(5)} list ${formatPaise(quote.listPaise).padStart(12)}` +
        `  less ${formatPaise(quote.discountPaise).padStart(10)}` +
        `  = ${formatPaise(quote.totalPaise).padStart(12)}` +
        `  (${formatPaise(perYear)}/yr)`,
    );

    check(`${tier}/${term}`, quote.totalPaise, EXPECTED[`${tier}/${term}`]);
  }
  console.log('');
}

// Integer-safety guard: every amount must be a whole number of paise.
console.log('Integer safety\n' + '-'.repeat(72));
for (const tier of SUBSCRIPTION_TIERS) {
  for (const term of SUBSCRIPTION_TERMS) {
    const q = computePrice(tier, term);
    if (q.kind !== 'priced') continue;
    for (const [field, value] of Object.entries({
      listPaise: q.listPaise,
      discountPaise: q.discountPaise,
      subtotalPaise: q.subtotalPaise,
      gstAmountPaise: q.gstAmountPaise,
      totalPaise: q.totalPaise,
    })) {
      if (!Number.isInteger(value)) {
        failures++;
        console.log(`  FAIL  ${tier}/${term} ${field} is not an integer: ${value}`);
      }
    }
  }
}
if (failures === 0) console.log('  PASS  all amounts are whole paise');

console.log('\n' + '='.repeat(72));
console.log(failures === 0 ? 'ALL CHECKS PASSED\n' : `${failures} CHECK(S) FAILED\n`);
process.exit(failures === 0 ? 0 : 1);