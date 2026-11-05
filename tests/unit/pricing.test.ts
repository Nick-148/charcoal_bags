import { describe, expect, it } from 'vitest';
import { limits, shipping } from '@/config/commerce';
import { mergeLines, nextTierForBags, priceCart, shippingForSubtotal, tierForBags } from '@/lib/pricing';

function ok(input: Parameters<typeof priceCart>[0]) {
  const result = priceCart(input);
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.cart;
}

describe('priceCart', () => {
  it('prices a single bag at list price with flat shipping', () => {
    const cart = ok([{ sku: 'SGL-BLK', quantity: 1 }]);
    expect(cart.subtotalCents).toBe(900);
    expect(cart.shippingCents).toBe(shipping.flatRateCents);
    expect(cart.totalCents).toBe(1300);
    expect(cart.bagCount).toBe(1);
    expect(cart.tier).toBeNull();
    expect(cart.nextTier).toEqual({ tier: expect.objectContaining({ minBags: 10 }), bagsNeeded: 9 });
  });

  it('counts a pair as two bags', () => {
    const cart = ok([{ sku: 'PR-MIX', quantity: 2 }]);
    expect(cart.bagCount).toBe(4);
    expect(cart.subtotalCents).toBe(3600);
  });

  it('gives free shipping at exactly the threshold', () => {
    expect(shippingForSubtotal(shipping.freeThresholdCents - 1)).toBe(shipping.flatRateCents);
    expect(shippingForSubtotal(shipping.freeThresholdCents)).toBe(0);
    // 4 singles = $36 ≥ $30
    expect(ok([{ sku: 'SGL-OLV', quantity: 4 }]).shippingCents).toBe(0);
  });

  it('applies team pricing at 10 bags and squad pricing at 25', () => {
    expect(tierForBags(9)).toBeNull();
    expect(tierForBags(10)?.perBagCents).toBe(750);
    expect(tierForBags(24)?.perBagCents).toBe(750);
    expect(tierForBags(25)?.perBagCents).toBe(650);

    const team = ok([
      { sku: 'SGL-BLK', quantity: 4 },
      { sku: 'PR-OLV', quantity: 3 },
    ]);
    expect(team.bagCount).toBe(10);
    expect(team.lines.map((l) => l.unitCents)).toEqual([750, 1500]);
    expect(team.subtotalCents).toBe(7500);
    expect(team.savingsCents).toBe(1500);
    expect(team.nextTier?.bagsNeeded).toBe(15);

    const squad = ok([{ sku: 'SGL-KFT', quantity: 25 }]);
    expect(squad.subtotalCents).toBe(25 * 650);
    expect(squad.nextTier).toBeNull();
  });

  it('merges duplicate SKUs', () => {
    expect(
      mergeLines([
        { sku: 'A', quantity: 1 },
        { sku: 'B', quantity: 2 },
        { sku: 'A', quantity: 3 },
      ]),
    ).toEqual([
      { sku: 'A', quantity: 4 },
      { sku: 'B', quantity: 2 },
    ]);
    expect(
      ok([
        { sku: 'SGL-BLK', quantity: 1 },
        { sku: 'SGL-BLK', quantity: 2 },
      ]).lines[0]?.quantity,
    ).toBe(3);
  });

  it('rejects empty carts, unknown SKUs, bad quantities, and oversized orders', () => {
    expect(priceCart([])).toMatchObject({ ok: false, issues: [{ code: 'empty' }] });
    expect(priceCart([{ sku: 'NOPE', quantity: 1 }])).toMatchObject({
      ok: false,
      issues: [{ code: 'unknown_sku' }],
    });
    expect(priceCart([{ sku: 'SGL-BLK', quantity: 0 }])).toMatchObject({
      ok: false,
      issues: [{ code: 'invalid_quantity' }],
    });
    expect(priceCart([{ sku: 'SGL-BLK', quantity: 1.5 }])).toMatchObject({ ok: false });
    expect(priceCart([{ sku: 'SGL-BLK', quantity: limits.maxQuantityPerLine + 1 }])).toMatchObject({
      ok: false,
      issues: [{ code: 'line_quantity_exceeded' }],
    });
    expect(
      priceCart([
        { sku: 'PR-BLK', quantity: 50 },
        { sku: 'SGL-BLK', quantity: 1 },
      ]),
    ).toMatchObject({ ok: false, issues: [{ code: 'too_many_bags' }] });
  });

  it('never produces a total that disagrees with its parts', () => {
    for (let qty = 1; qty <= 30; qty++) {
      const cart = ok([{ sku: 'SGL-BNE', quantity: qty }]);
      expect(cart.totalCents).toBe(cart.subtotalCents + cart.shippingCents + cart.taxCents);
      expect(cart.subtotalCents).toBe(cart.lines.reduce((s, l) => s + l.lineTotalCents, 0));
    }
  });
});

describe('nextTierForBags', () => {
  it('returns the closest tier above the current count', () => {
    expect(nextTierForBags(0)?.bagsNeeded).toBe(10);
    expect(nextTierForBags(12)?.tier.minBags).toBe(25);
  });
});
