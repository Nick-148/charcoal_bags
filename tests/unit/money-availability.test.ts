import { describe, expect, it } from 'vitest';
import {
  describeAvailability,
  formatShipDate,
  isPurchasable,
  latestShipDate,
  toAvailability,
  type InventoryRow,
} from '@/lib/availability';
import { formatCents, formatCentsExact } from '@/lib/money';

const row = (over: Partial<InventoryRow> = {}): InventoryRow => ({
  sku: 'SGL-BLK',
  mode: 'in_stock',
  available: 5,
  ships_by: null,
  active: 1,
  updated_at: '2026-11-01T00:00:00Z',
  ...over,
});

describe('money', () => {
  it('formats whole dollars without cents and others with cents', () => {
    expect(formatCents(900)).toBe('$9');
    expect(formatCents(750)).toBe('$7.50');
    expect(formatCentsExact(900)).toBe('$9.00');
    expect(() => formatCents(1.5)).toThrow(TypeError);
  });
});

describe('availability', () => {
  it('maps inventory rows to storefront states', () => {
    expect(toAvailability('X', undefined).status).toBe('unavailable');
    expect(toAvailability('X', row({ active: 0 })).status).toBe('unavailable');
    expect(toAvailability('X', row({ available: 0 })).status).toBe('sold_out');
    expect(toAvailability('X', row()).status).toBe('in_stock');
    expect(toAvailability('X', row({ available: null })).remaining).toBeNull();
    const pre = toAvailability('X', row({ mode: 'preorder', ships_by: '2026-12-11' }));
    expect(pre).toMatchObject({ status: 'preorder', shipsBy: '2026-12-11' });
    expect(isPurchasable(pre)).toBe(true);
    expect(describeAvailability(pre)).toContain('Dec 11, 2026');
    expect(describeAvailability({ ...pre, shipsBy: null })).toContain('30 days');
  });

  it('formats ship dates in UTC and tolerates garbage', () => {
    expect(formatShipDate('2026-01-01')).toBe('Jan 1, 2026');
    expect(formatShipDate('soon')).toBe('soon');
  });

  it('picks the latest ship date', () => {
    expect(latestShipDate(['2026-12-01', null, '2027-01-05', '2026-12-31'])).toBe('2027-01-05');
    expect(latestShipDate([null])).toBeNull();
  });
});
