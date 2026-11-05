/**
 * Client-side cart state, persisted to localStorage and synced across tabs. Holds only SKUs and
 * quantities — prices are always recomputed (and re-validated on the server at checkout).
 */
import { persistentAtom } from '@nanostores/persistent';
import { computed } from 'nanostores';
import { findBySku } from '@/config/catalog';
import { limits } from '@/config/commerce';
import type { CartLineInput } from '@/lib/pricing';

export const CART_STORAGE_KEY = 'bbo:cart:v1';

export function sanitizeCart(value: unknown): CartLineInput[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: CartLineInput[] = [];
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) continue;
    const { sku, quantity } = entry as Record<string, unknown>;
    if (typeof sku !== 'string' || !findBySku(sku) || seen.has(sku)) continue;
    if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1) continue;
    seen.add(sku);
    out.push({ sku, quantity: Math.min(quantity, limits.maxQuantityPerLine) });
  }
  return out.slice(0, limits.maxLines);
}

export const cartItems = persistentAtom<CartLineInput[]>(CART_STORAGE_KEY, [], {
  encode: JSON.stringify,
  decode: (raw) => {
    try {
      return sanitizeCart(JSON.parse(raw));
    } catch {
      return [];
    }
  },
});

export const cartUnitCount = computed(cartItems, (items) => items.reduce((n, i) => n + i.quantity, 0));

export function addToCart(sku: string, quantity: number): void {
  const items = cartItems.get();
  const existing = items.find((i) => i.sku === sku);
  const next = existing
    ? items.map((i) => (i.sku === sku ? { ...i, quantity: i.quantity + quantity } : i))
    : [...items, { sku, quantity }];
  cartItems.set(sanitizeCart(next));
}

export function setQuantity(sku: string, quantity: number): void {
  if (quantity <= 0) return removeFromCart(sku);
  cartItems.set(sanitizeCart(cartItems.get().map((i) => (i.sku === sku ? { ...i, quantity } : i))));
}

export function removeFromCart(sku: string): void {
  cartItems.set(cartItems.get().filter((i) => i.sku !== sku));
}

export function clearCart(): void {
  cartItems.set([]);
}
