import { useStore } from '@nanostores/react';
import { cartUnitCount } from './store';
import { useHydrated } from './useHydrated';

export default function CartBadge() {
  const count = useStore(cartUnitCount);
  // localStorage is unavailable during SSR; render the empty state until hydrated to avoid a mismatch.
  const shown = useHydrated() ? count : 0;

  return (
    <a
      href="/cart"
      className="btn-secondary relative min-h-10 px-3"
      aria-label={shown > 0 ? `Cart, ${shown} item${shown === 1 ? '' : 's'}` : 'Cart, empty'}
    >
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5"
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <path d="M5 8h14l-1.2 11.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8L5 8Z" />
        <path d="M9 8V6a3 3 0 0 1 6 0v2" />
      </svg>
      <span className="eyebrow">Cart</span>
      <span
        aria-hidden="true"
        className={`min-w-6 rounded-sm px-1.5 text-center font-mono text-xs leading-6 ${shown > 0 ? 'bg-accent text-accent-ink' : 'bg-surface-sunken text-fg-subtle'}`}
      >
        {shown}
      </span>
    </a>
  );
}
