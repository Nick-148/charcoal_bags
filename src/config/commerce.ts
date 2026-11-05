/**
 * Commerce rules: shipping, bulk tiers, order limits, tax.
 * Decisions recorded in docs/adr/0012-shipping-policy.md, 0013-bulk-pricing.md, 0014-sales-tax.md.
 */

export const currency = 'usd' as const;

export const shipping = {
  /** ISO country codes Stripe Checkout will accept shipping addresses for. */
  allowedCountries: ['US'] as const,
  flatRateCents: 400,
  /** Merchandise subtotal (after bulk pricing) at or above which shipping is free. */
  freeThresholdCents: 3000,
  standardLabel: 'Standard US shipping (USPS)',
  freeLabel: 'Free US shipping',
  /** Promise shown for in-stock items. */
  inStockDispatch: 'Ships in 2–3 business days',
} as const;

export interface BulkTier {
  /** Inclusive minimum number of bags in the cart (a pair counts as 2). */
  minBags: number;
  perBagCents: number;
  label: string;
}

/** Ordered from largest to smallest so the first match wins. */
export const bulkTiers: readonly BulkTier[] = [
  { minBags: 25, perBagCents: 650, label: 'Squad pricing' },
  { minBags: 10, perBagCents: 750, label: 'Team pricing' },
];

export const limits = {
  /** Larger orders go through the bulk quote form. */
  maxBagsPerOrder: 100,
  maxQuantityPerLine: 50,
  maxLines: 12,
  /** Stripe requires Checkout Sessions to live at least 30 minutes. */
  checkoutSessionTtlMinutes: 31,
} as const;

export const tax = {
  /** NH has no sales tax and we are below economic-nexus thresholds elsewhere. Revisit per ADR 0014. */
  collectSalesTax: false,
} as const;

/**
 * Rough per-order costs used ONLY for the admin "LLC trigger" estimate (first $500 net profit).
 * Not accounting — just a progress indicator.
 */
export const estimates = {
  cogsPerBagCents: 150,
  stripePercent: 2.9,
  stripeFixedCents: 30,
  shippingLabelCents: 450,
  llcTriggerNetProfitCents: 50_000,
} as const;
