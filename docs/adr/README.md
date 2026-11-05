# Architecture Decision Records

Short records of decisions that shape this codebase. Add one whenever a choice is hard to reverse,
surprising, or was made without the founder's explicit input. Copy `template.md`, use the next number,
and never rewrite history — supersede an ADR with a new one instead.

| #    | Decision                                                                                        | Status   |
| ---- | ----------------------------------------------------------------------------------------------- | -------- |
| 0001 | [Record architecture decisions](0001-record-architecture-decisions.md)                          | Accepted |
| 0002 | [Astro 7 + React islands + Tailwind on Cloudflare Workers](0002-astro-on-cloudflare-workers.md) | Accepted |
| 0003 | [Cloudflare D1 as the database](0003-cloudflare-d1.md)                                          | Accepted |
| 0004 | [Catalog & prices in code, inventory in D1](0004-catalog-in-code-inventory-in-d1.md)            | Accepted |
| 0005 | [Stripe Checkout; pre-orders charged at checkout](0005-stripe-checkout-preorders.md)            | Accepted |
| 0006 | [Inventory reservations & reconciliation](0006-inventory-reservations.md)                       | Accepted |
| 0007 | [Admin auth: Cloudflare Access + in-Worker JWT check](0007-admin-auth-cloudflare-access.md)     | Accepted |
| 0008 | [Email behind an interface (console / Resend)](0008-email-behind-interface.md)                  | Accepted |
| 0009 | [Turnstile, rate limits, honeypot](0009-turnstile-and-rate-limits.md)                           | Accepted |
| 0010 | [Provisional brand lives in config](0010-provisional-brand-in-config.md)                        | Accepted |
| 0011 | [Launch on *.workers.dev](0011-launch-domain.md)                                                | Accepted |
| 0012 | [Shipping policy](0012-shipping-policy.md)                                                      | Accepted |
| 0013 | [Bulk pricing tiers + quote form](0013-bulk-pricing.md)                                         | Accepted |
| 0014 | [No sales tax collection at launch](0014-sales-tax.md)                                          | Accepted |
| 0015 | [Blocked dependencies go behind interfaces](0015-blocked-dependencies-behind-interfaces.md)     | Accepted |
| 0016 | [Security headers & CSP](0016-security-headers-csp.md)                                          | Accepted |
