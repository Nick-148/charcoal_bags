import { useStore } from '@nanostores/react';
import { useEffect, useMemo, useState } from 'react';
import BagArt from '@/components/BagArt';
import { limits, shipping } from '@/config/commerce';
import { describeAvailability, isPurchasable, type Availability } from '@/lib/availability';
import { formatCents, formatCentsExact } from '@/lib/money';
import { priceCart } from '@/lib/pricing';
import { cartItems, clearCart, removeFromCart, setQuantity } from './store';
import { useHydrated } from './useHydrated';

interface CheckoutError {
  error: string;
  issues?: { sku?: string; message: string }[];
}

export default function CartView({ canceled = false }: { canceled?: boolean }) {
  const items = useStore(cartItems);
  const mounted = useHydrated();
  const [availability, setAvailability] = useState<Record<string, Availability>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<CheckoutError | null>(null);

  const skuKey = items.map((i) => i.sku).join(',');
  useEffect(() => {
    if (!skuKey) return;
    const controller = new AbortController();
    fetch(`/api/availability?skus=${encodeURIComponent(skuKey)}`, { signal: controller.signal })
      .then((r) => (r.ok ? (r.json() as Promise<{ availability: Availability[] }>) : null))
      .then((data) => {
        if (data) setAvailability(Object.fromEntries(data.availability.map((a) => [a.sku, a])));
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [skuKey]);

  const priced = useMemo(() => priceCart(items), [items]);

  if (!mounted) {
    return <p className="text-fg-muted">Loading your cart…</p>;
  }

  if (items.length === 0) {
    return (
      <div className="card stitch p-8 text-center">
        <p className="heading-display text-3xl">Cart is empty</p>
        <p className="mt-2 text-fg-muted">Your sneakers are still on their own out there.</p>
        <a href="/shop" className="btn-primary mt-6">
          Shop the bags
        </a>
      </div>
    );
  }

  if (!priced.ok) {
    return (
      <div className="card p-6">
        {priced.issues.map((issue) => (
          <p key={issue.message} className="text-danger">
            {issue.message}
          </p>
        ))}
        <button type="button" className="btn-secondary mt-4" onClick={clearCart}>
          Clear cart
        </button>
      </div>
    );
  }

  const cart = priced.cart;
  const unavailable = cart.lines.filter((l) => availability[l.sku] && !isPurchasable(availability[l.sku]!));
  const issueFor = (sku: string) => error?.issues?.find((i) => i.sku === sku)?.message;

  async function checkout() {
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });
      const data = (await response.json().catch(() => null)) as { url?: string } & Partial<CheckoutError>;
      if (response.ok && data?.url) {
        window.location.assign(data.url);
        return;
      }
      setError({ error: data?.error ?? 'Checkout failed. Please try again.', issues: data?.issues ?? [] });
    } catch {
      setError({ error: 'Network hiccup — check your connection and try again.' });
    }
    setSubmitting(false);
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
      <div>
        {canceled && (
          <p className="card mb-4 border-warn/60 p-4 text-sm text-warn" role="status">
            Checkout canceled — nothing was charged and your cart is saved.
          </p>
        )}
        <ul className="divide-y divide-line border-y border-line">
          {cart.lines.map((line) => {
            const a = availability[line.sku];
            const lineIssue = issueFor(line.sku);
            return (
              <li key={line.sku} className="flex gap-4 py-4">
                <BagArt colorways={line.colorways} className="h-20 w-20 shrink-0" />
                <div className="flex min-w-0 grow flex-col gap-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <a href={`/shop/${line.productSlug}`} className="font-semibold hover:text-accent">
                      {line.productName}
                    </a>
                    <span className="font-mono">{formatCentsExact(line.lineTotalCents)}</span>
                  </div>
                  <p className="text-sm text-fg-muted">{line.variantName}</p>
                  <p className="text-sm text-fg-subtle">
                    {formatCents(line.unitCents)} each
                    {line.unitCents < line.listUnitCents && (
                      <span className="ml-2 text-fg-subtle line-through">
                        {formatCents(line.listUnitCents)}
                      </span>
                    )}
                  </p>
                  {a && <p className="eyebrow text-[11px] text-accent">{describeAvailability(a)}</p>}
                  {lineIssue && <p className="text-sm text-danger">{lineIssue}</p>}
                  <div className="mt-1 flex items-center gap-3">
                    <label className="sr-only" htmlFor={`qty-${line.sku}`}>
                      Quantity for {line.productName} {line.variantName}
                    </label>
                    <select
                      id={`qty-${line.sku}`}
                      value={line.quantity}
                      onChange={(e) => setQuantity(line.sku, Number(e.target.value))}
                      className="field w-20 py-1.5"
                    >
                      {Array.from({ length: limits.maxQuantityPerLine }, (_, i) => i + 1).map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => removeFromCart(line.sku)}
                      className="text-sm text-fg-subtle underline underline-offset-4 hover:text-danger"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <aside className="card h-fit space-y-4 p-5" aria-label="Order summary">
        <h2 className="heading-display text-2xl">Mission summary</h2>

        <div className="space-y-2 text-sm">
          <p className="flex justify-between">
            <span className="text-fg-muted">Bags</span>
            <span className="font-mono">{cart.bagCount}</span>
          </p>
          {cart.savingsCents > 0 && (
            <p className="flex justify-between text-ok">
              <span>{cart.tier?.label}</span>
              <span className="font-mono">−{formatCentsExact(cart.savingsCents)}</span>
            </p>
          )}
          <p className="flex justify-between">
            <span className="text-fg-muted">Subtotal</span>
            <span className="font-mono">{formatCentsExact(cart.subtotalCents)}</span>
          </p>
          <p className="flex justify-between">
            <span className="text-fg-muted">Shipping (US)</span>
            <span className="font-mono">
              {cart.shippingCents === 0 ? 'Free' : formatCentsExact(cart.shippingCents)}
            </span>
          </p>
          <p className="flex justify-between border-t border-line pt-2 text-base font-semibold">
            <span>Total</span>
            <span className="font-mono">{formatCentsExact(cart.totalCents)}</span>
          </p>
        </div>

        {cart.freeShippingRemainingCents > 0 && (
          <div>
            <p className="text-sm text-fg-muted">
              Add {formatCents(cart.freeShippingRemainingCents)} more for free shipping.
            </p>
            <progress
              className="mt-1 h-1.5 w-full appearance-none overflow-hidden rounded-sm [&::-moz-progress-bar]:bg-accent [&::-webkit-progress-bar]:bg-surface-sunken [&::-webkit-progress-value]:bg-accent"
              max={shipping.freeThresholdCents}
              value={cart.subtotalCents}
              aria-label="Progress to free shipping"
            />
          </div>
        )}
        {cart.nextTier && (
          <p className="text-sm text-fg-muted">
            Add {cart.nextTier.bagsNeeded} more bag{cart.nextTier.bagsNeeded === 1 ? '' : 's'} to unlock{' '}
            <span className="text-accent">
              {cart.nextTier.tier.label} ({formatCents(cart.nextTier.tier.perBagCents)}/bag)
            </span>
            .
          </p>
        )}

        {error && (
          <div role="alert" className="rounded-sm border border-danger/60 p-3 text-sm text-danger">
            {error.error}
          </div>
        )}

        <button
          type="button"
          className="btn-primary w-full"
          onClick={checkout}
          disabled={submitting || unavailable.length > 0}
        >
          {submitting ? 'Opening secure checkout…' : 'Secure checkout'}
        </button>
        {unavailable.length > 0 && <p className="text-sm text-danger">Remove sold-out items to continue.</p>}
        <p className="text-xs text-fg-subtle">
          Payments are processed by Stripe. Pre-order items are charged today and ship by the date shown.
        </p>
      </aside>
    </div>
  );
}
