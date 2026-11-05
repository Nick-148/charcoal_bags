# 0005. Stripe Checkout; Founder's Pre-Orders charged at checkout

- **Status:** Accepted
- **Date:** 2026-11-04
- **Decided by:** founder (charge at checkout), agent (hosted Checkout)

## Context

The brief requires Stripe and a pre-order model that funds production. Card authorizations expire
after ~7 days, so authorize-now/capture-later doesn't fit multi-week batches.

## Decision

- Use **hosted Stripe Checkout** (redirect). No card data touches our servers; Apple/Google Pay and
  Link come free; PCI scope is SAQ-A.
- Server builds line items from the catalog (`price_data`), sets a fixed shipping rate, collects US
  shipping addresses, and sets `expires_at` = 31 minutes.
- **Pre-orders are charged immediately.** The ship-by date is shown on the PDP, in the cart, on the
  Stripe page (`custom_text.submit`), and on the success page. Policy: ship by the date or offer a
  full refund (FTC Mail Order Rule; 30 days if no date).
- Webhooks: `checkout.session.completed`, `.expired`, `.async_payment_succeeded`,
  `.async_payment_failed`, `charge.refunded`. Customer receipts come from Stripe's receipt emails.
- In development, a **fake gateway** (`/checkout/fake`) simulates the hosted page; refused in production.

## Consequences

- Founder must enable "Successful payments" receipt emails in the Stripe dashboard.
- One-click full refunds from the admin (`refundOrder`); partial refunds via the Stripe dashboard are
  picked up by the `charge.refunded` webhook.
