/**
 * Cart pricing — pure and isomorphic. The browser uses it for display; the server re-runs it on
 * checkout and never trusts client-supplied prices.
 */
import { findBySku, type ColorwayId } from '@/config/catalog';
import { bulkTiers, limits, shipping, type BulkTier } from '@/config/commerce';

export interface CartLineInput {
  sku: string;
  quantity: number;
}

export interface PricedLine {
  sku: string;
  productSlug: string;
  productName: string;
  variantName: string;
  colorways: readonly ColorwayId[];
  quantity: number;
  bagsPerUnit: number;
  bags: number;
  listUnitCents: number;
  unitCents: number;
  lineTotalCents: number;
}

export interface PricedCart {
  lines: PricedLine[];
  bagCount: number;
  listSubtotalCents: number;
  subtotalCents: number;
  savingsCents: number;
  tier: BulkTier | null;
  nextTier: { tier: BulkTier; bagsNeeded: number } | null;
  shippingCents: number;
  freeShippingRemainingCents: number;
  taxCents: number;
  totalCents: number;
}

export type PricingIssueCode =
  | 'empty'
  | 'unknown_sku'
  | 'invalid_quantity'
  | 'line_quantity_exceeded'
  | 'too_many_lines'
  | 'too_many_bags';

export interface PricingIssue {
  code: PricingIssueCode;
  sku?: string;
  message: string;
}

export type PricingResult = { ok: true; cart: PricedCart } | { ok: false; issues: PricingIssue[] };

export function tierForBags(bagCount: number): BulkTier | null {
  return bulkTiers.find((t) => bagCount >= t.minBags) ?? null;
}

export function nextTierForBags(bagCount: number): { tier: BulkTier; bagsNeeded: number } | null {
  const upcoming = [...bulkTiers].reverse().find((t) => bagCount < t.minBags);
  return upcoming ? { tier: upcoming, bagsNeeded: upcoming.minBags - bagCount } : null;
}

export function shippingForSubtotal(subtotalCents: number): number {
  return subtotalCents >= shipping.freeThresholdCents ? 0 : shipping.flatRateCents;
}

/** Collapses duplicate SKUs, preserving first-seen order. */
export function mergeLines(lines: readonly CartLineInput[]): CartLineInput[] {
  const merged = new Map<string, number>();
  for (const { sku, quantity } of lines) merged.set(sku, (merged.get(sku) ?? 0) + quantity);
  return [...merged].map(([sku, quantity]) => ({ sku, quantity }));
}

export function priceCart(input: readonly CartLineInput[]): PricingResult {
  const issues: PricingIssue[] = [];
  const lines = mergeLines(input);

  if (lines.length === 0) return { ok: false, issues: [{ code: 'empty', message: 'Your cart is empty.' }] };
  if (lines.length > limits.maxLines) {
    issues.push({
      code: 'too_many_lines',
      message: `A cart can hold up to ${limits.maxLines} different items.`,
    });
  }

  const resolved = [];
  for (const line of lines) {
    const entry = findBySku(line.sku);
    if (!entry) {
      issues.push({ code: 'unknown_sku', sku: line.sku, message: 'An item in your cart is no longer sold.' });
      continue;
    }
    if (!Number.isInteger(line.quantity) || line.quantity < 1) {
      issues.push({ code: 'invalid_quantity', sku: line.sku, message: 'Quantities must be whole numbers.' });
      continue;
    }
    if (line.quantity > limits.maxQuantityPerLine) {
      issues.push({
        code: 'line_quantity_exceeded',
        sku: line.sku,
        message: `Up to ${limits.maxQuantityPerLine} of one item per order — use the bulk quote form for more.`,
      });
      continue;
    }
    resolved.push({ ...entry, quantity: line.quantity });
  }

  const bagCount = resolved.reduce((sum, l) => sum + l.quantity * l.product.bagsPerUnit, 0);
  if (bagCount > limits.maxBagsPerOrder) {
    issues.push({
      code: 'too_many_bags',
      message: `Online orders top out at ${limits.maxBagsPerOrder} bags. Request a bulk quote for bigger runs.`,
    });
  }
  if (issues.length > 0) return { ok: false, issues };

  const tier = tierForBags(bagCount);
  const pricedLines: PricedLine[] = resolved.map(({ product, variant, quantity }) => {
    const unitCents = tier ? tier.perBagCents * product.bagsPerUnit : product.priceCents;
    return {
      sku: variant.sku,
      productSlug: product.slug,
      productName: product.name,
      variantName: variant.name,
      colorways: variant.colorways,
      quantity,
      bagsPerUnit: product.bagsPerUnit,
      bags: quantity * product.bagsPerUnit,
      listUnitCents: product.priceCents,
      unitCents,
      lineTotalCents: unitCents * quantity,
    };
  });

  const listSubtotalCents = pricedLines.reduce((s, l) => s + l.listUnitCents * l.quantity, 0);
  const subtotalCents = pricedLines.reduce((s, l) => s + l.lineTotalCents, 0);
  const shippingCents = shippingForSubtotal(subtotalCents);
  const taxCents = 0;

  return {
    ok: true,
    cart: {
      lines: pricedLines,
      bagCount,
      listSubtotalCents,
      subtotalCents,
      savingsCents: listSubtotalCents - subtotalCents,
      tier,
      nextTier: nextTierForBags(bagCount),
      shippingCents,
      freeShippingRemainingCents: Math.max(0, shipping.freeThresholdCents - subtotalCents),
      taxCents,
      totalCents: subtotalCents + shippingCents + taxCents,
    },
  };
}
