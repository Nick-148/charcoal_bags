---
name: add-product
description: Add a new product or colorway/variant (SKU) to the catalog with its inventory row, tests, and copy. Use when asked to add a product, size, bundle, or colorway.
---

# Add a product or variant

Products and prices live in code. Inventory lives in D1 (ADR 0004). Both must change together.

1. **Catalog:** edit `src/config/catalog.ts`.
   - New colorway: add it to the `ColorwayId` union and the `colorways` map (canvas and stitch hex values).
   - New variant: add `{ sku, name, colorways }` to the product. SKU format `^[A-Z0-9-]{2,24}$`,
     prefix `SGL-` for singles and `PR-` for pairs. Never reuse or rename an existing SKU. Old orders
     reference it.
   - New product: set `bagsPerUnit` (drives bulk tiers), `priceCents`, and copy that follows the
     brand voice in `docs/business/brand.md`. No health claims.
2. **Inventory row:** create a new migration (see the `db-migration` skill), e.g.
   `migrations/000N_add_<sku>.sql`:
   ```sql
   INSERT INTO inventory (sku, mode, available, ships_by, active)
   VALUES ('SGL-NEW', 'preorder', 20, '2027-01-15', 1)
   ON CONFLICT (sku) DO NOTHING;
   ```
   A SKU without a row shows as "Currently unavailable" (fails closed).
3. **Tests:** extend `tests/unit/pricing.test.ts` if pricing behaviour changes (new `bagsPerUnit`, etc.).
4. **Verify:** `npm run db:migrate:local && npm run verify && npm run test:e2e`, then check the PDP
   and cart in the browser.
5. **Ship:** after deploy, run `npm run db:migrate:remote`. Log it in `PROGRESS.md`.
