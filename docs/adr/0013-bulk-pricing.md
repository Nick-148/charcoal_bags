# 0013. Bulk pricing tiers + custom quote form

- **Status:** Accepted
- **Date:** 2026-11-04
- **Decided by:** founder

## Decision

Automatic per-bag pricing based on total bags in the cart (a pair counts as 2): **10+ → $7.50/bag,
25+ → $6.50/bag**. Applied by re-pricing line items (no coupons). Online orders cap at 100 bags;
larger or custom (team colors/logos) orders use the `/bulk` quote form → admin inbox + email alert.

## Consequences

At $6.50 the margin is still ~77% on $1.50 COGS. Tiers are config; changing them needs a deploy.
