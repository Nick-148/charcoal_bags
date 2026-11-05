import { useState } from 'react';
import BagArt from '@/components/BagArt';
import type { ColorwayId } from '@/config/catalog';
import { limits } from '@/config/commerce';
import { describeAvailability, isPurchasable, type Availability } from '@/lib/availability';
import { formatCents } from '@/lib/money';
import { addToCart, cartItems } from './store';

export interface AddToCartVariant {
  sku: string;
  name: string;
  colorways: readonly ColorwayId[];
  availability: Availability;
}

interface Props {
  productName: string;
  priceCents: number;
  bagsPerUnit: number;
  variants: AddToCartVariant[];
}

export default function AddToCart({ productName, priceCents, bagsPerUnit, variants }: Props) {
  const firstBuyable = variants.find((v) => isPurchasable(v.availability)) ?? variants[0];
  const [sku, setSku] = useState(firstBuyable?.sku ?? '');
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState<string | null>(null);

  const selected = variants.find((v) => v.sku === sku);
  if (!selected) return null;

  const buyable = isPurchasable(selected.availability);
  const maxQty = Math.max(
    1,
    Math.min(limits.maxQuantityPerLine, selected.availability.remaining ?? limits.maxQuantityPerLine),
  );
  const qty = Math.min(quantity, maxQty);

  function select(nextSku: string) {
    setSku(nextSku);
    setQuantity(1);
    setAdded(null);
  }

  function submit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!buyable || !selected) return;
    const before = cartItems.get().find((i) => i.sku === selected.sku)?.quantity ?? 0;
    addToCart(selected.sku, qty);
    const added = (cartItems.get().find((i) => i.sku === selected.sku)?.quantity ?? 0) - before;
    setAdded(
      added === qty
        ? `${qty} × ${productName} (${selected.name}) added.`
        : `Added ${added} — your cart holds the maximum of ${limits.maxQuantityPerLine} of this item.`,
    );
  }

  return (
    <form onSubmit={submit} className="space-y-6" aria-describedby="availability-note">
      <fieldset>
        <legend className="field-label">Colorway — {selected.name}</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {variants.map((v) => {
            const checked = v.sku === sku;
            const soldOut = !isPurchasable(v.availability);
            return (
              <label
                key={v.sku}
                className={`card flex cursor-pointer flex-col items-center gap-1 p-2 text-center transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent ${checked ? 'border-accent' : 'hover:border-line-strong'} ${soldOut ? 'opacity-50' : ''}`}
              >
                <input
                  type="radio"
                  name="variant"
                  value={v.sku}
                  checked={checked}
                  onChange={() => select(v.sku)}
                  className="sr-only"
                />
                <BagArt colorways={v.colorways} className="h-14 w-auto" />
                <span className="text-xs leading-tight">{v.name}</span>
                {soldOut && <span className="eyebrow text-[10px] text-fg-subtle">Sold out</span>}
              </label>
            );
          })}
        </div>
      </fieldset>

      <p id="availability-note" className={`eyebrow ${buyable ? 'text-accent' : 'text-fg-subtle'}`}>
        {describeAvailability(selected.availability)}
        {selected.availability.remaining !== null && buyable && selected.availability.remaining <= 10
          ? ` · ${selected.availability.remaining} left in this batch`
          : ''}
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="qty" className="field-label">
            Quantity
          </label>
          <div className="flex items-stretch">
            <button
              type="button"
              className="btn-secondary min-h-11 rounded-r-none px-3"
              onClick={() => setQuantity(Math.max(1, qty - 1))}
              aria-label="Decrease quantity"
              disabled={qty <= 1}
            >
              −
            </button>
            <input
              id="qty"
              type="number"
              inputMode="numeric"
              min={1}
              max={maxQty}
              value={qty}
              onChange={(e) => setQuantity(Math.max(1, Math.min(maxQty, Number(e.target.value) || 1)))}
              className="field w-16 rounded-none text-center"
            />
            <button
              type="button"
              className="btn-secondary min-h-11 rounded-l-none px-3"
              onClick={() => setQuantity(Math.min(maxQty, qty + 1))}
              aria-label="Increase quantity"
              disabled={qty >= maxQty}
            >
              +
            </button>
          </div>
        </div>
        <button type="submit" className="btn-primary grow sm:grow-0" disabled={!buyable}>
          {buyable ? `Add to cart — ${formatCents(priceCents * qty)}` : 'Sold out'}
        </button>
      </div>

      {bagsPerUnit > 1 && (
        <p className="text-sm text-fg-muted">Counts as {bagsPerUnit} bags toward bulk pricing.</p>
      )}

      <div aria-live="polite" className="min-h-6">
        {added && (
          <p className="text-sm text-ok">
            {added}{' '}
            <a href="/cart" className="text-accent underline underline-offset-4">
              View cart →
            </a>
          </p>
        )}
      </div>
    </form>
  );
}
