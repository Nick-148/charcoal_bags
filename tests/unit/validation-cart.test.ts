import { describe, expect, it } from 'vitest';
import { sanitizeCart } from '@/components/cart/store';
import { limits } from '@/config/commerce';
import {
  bulkInquirySchema,
  checkoutRequestSchema,
  contactInquirySchema,
  inventoryUpdateSchema,
} from '@/server/validation';

describe('checkoutRequestSchema', () => {
  it('accepts well-formed carts and rejects junk', () => {
    expect(checkoutRequestSchema.safeParse({ items: [{ sku: 'SGL-BLK', quantity: 2 }] }).success).toBe(true);
    expect(checkoutRequestSchema.safeParse({ items: [] }).success).toBe(false);
    expect(
      checkoutRequestSchema.safeParse({ items: [{ sku: "x'; DROP TABLE orders;--", quantity: 1 }] }).success,
    ).toBe(false);
    expect(checkoutRequestSchema.safeParse({ items: [{ sku: 'SGL-BLK', quantity: -1 }] }).success).toBe(
      false,
    );
    expect(
      checkoutRequestSchema.safeParse({ items: [{ sku: 'SGL-BLK', quantity: 1, priceCents: 1 }] }).success,
    ).toBe(true);
  });
});

describe('inquiry schemas', () => {
  it('validates contact messages', () => {
    expect(
      contactInquirySchema.safeParse({
        name: 'Ann',
        email: 'ann@example.com',
        topic: 'Order question',
        message: 'Where is my order?',
      }).success,
    ).toBe(true);
    const bad = contactInquirySchema.safeParse({ name: '', email: 'nope', topic: 'Spam', message: 'hi' });
    expect(bad.success).toBe(false);
  });

  it('validates bulk requests and normalises optional dates', () => {
    const parsed = bulkInquirySchema.parse({
      name: 'Coach',
      email: 'coach@example.com',
      organization: 'Wildcats',
      quantity: '40',
      neededBy: '',
      customization: '',
      message: 'Need 40 for the team.',
    });
    expect(parsed.quantity).toBe(40);
    expect(parsed.neededBy).toBeNull();
    expect(bulkInquirySchema.safeParse({ ...parsed, quantity: '5', neededBy: '' }).success).toBe(false);
    expect(bulkInquirySchema.safeParse({ ...parsed, quantity: '40', neededBy: '2026-02-30x' }).success).toBe(
      false,
    );
  });

  it('parses admin inventory edits', () => {
    expect(
      inventoryUpdateSchema.parse({
        sku: 'SGL-BLK',
        mode: 'preorder',
        available: '',
        shipsBy: '2026-12-11',
        active: true,
      }).available,
    ).toBeNull();
    expect(
      inventoryUpdateSchema.parse({
        sku: 'SGL-BLK',
        mode: 'in_stock',
        available: '12',
        shipsBy: '',
        active: true,
      }),
    ).toMatchObject({ available: 12, shipsBy: null });
    expect(
      inventoryUpdateSchema.safeParse({
        sku: 'SGL-BLK',
        mode: 'in_stock',
        available: '-3',
        shipsBy: '',
        active: true,
      }).success,
    ).toBe(false);
  });
});

describe('sanitizeCart', () => {
  it('drops unknown SKUs, invalid quantities, and duplicates; clamps quantity', () => {
    expect(
      sanitizeCart([
        { sku: 'SGL-BLK', quantity: 2 },
        { sku: 'SGL-BLK', quantity: 5 },
        { sku: 'NOPE', quantity: 1 },
        { sku: 'PR-MIX', quantity: 0 },
        { sku: 'PR-OLV', quantity: 999 },
        'garbage',
        null,
      ]),
    ).toEqual([
      { sku: 'SGL-BLK', quantity: 2 },
      { sku: 'PR-OLV', quantity: limits.maxQuantityPerLine },
    ]);
    expect(sanitizeCart('not an array')).toEqual([]);
  });
});
