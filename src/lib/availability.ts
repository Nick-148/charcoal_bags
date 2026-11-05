import { shipping } from '@/config/commerce';

export type InventoryMode = 'in_stock' | 'preorder';
export type AvailabilityStatus = 'in_stock' | 'preorder' | 'sold_out' | 'unavailable';

/** Shape of a row in the `inventory` table. */
export interface InventoryRow {
  sku: string;
  mode: InventoryMode;
  /** Units that can still be sold. NULL = unlimited (made to order). */
  available: number | null;
  /** ISO date (YYYY-MM-DD) pre-orders are promised to ship by. */
  ships_by: string | null;
  active: number;
  updated_at: string;
}

export interface Availability {
  sku: string;
  status: AvailabilityStatus;
  /** Units left, or null when unlimited / unknown. */
  remaining: number | null;
  shipsBy: string | null;
}

export function toAvailability(sku: string, row: InventoryRow | undefined | null): Availability {
  if (!row || row.active !== 1) return { sku, status: 'unavailable', remaining: 0, shipsBy: null };
  if (row.available !== null && row.available <= 0) {
    return { sku, status: 'sold_out', remaining: 0, shipsBy: null };
  }
  return {
    sku,
    status: row.mode === 'preorder' ? 'preorder' : 'in_stock',
    remaining: row.available,
    shipsBy: row.mode === 'preorder' ? row.ships_by : null,
  };
}

export function isPurchasable(a: Availability): boolean {
  return a.status === 'in_stock' || a.status === 'preorder';
}

const shipDateFormat = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

/** "2026-12-11" → "Dec 11, 2026". Returns the input unchanged if it is not an ISO date. */
export function formatShipDate(isoDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return isoDate;
  const date = new Date(`${isoDate}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? isoDate : shipDateFormat.format(date);
}

export function describeAvailability(a: Availability): string {
  switch (a.status) {
    case 'in_stock':
      return shipping.inStockDispatch;
    case 'preorder':
      return a.shipsBy
        ? `Founder’s Pre-Order — ships by ${formatShipDate(a.shipsBy)}`
        : 'Founder’s Pre-Order — ships within 30 days';
    case 'sold_out':
      return 'Sold out — next batch coming';
    case 'unavailable':
      return 'Currently unavailable';
  }
}

/** Latest ship-by date among the given ISO dates (lexicographic order works for YYYY-MM-DD). */
export function latestShipDate(dates: readonly (string | null)[]): string | null {
  const real = dates.filter((d): d is string => !!d).sort();
  return real.at(-1) ?? null;
}
