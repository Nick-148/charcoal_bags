# 0004. Catalog & prices in code, inventory in D1

- **Status:** Accepted
- **Date:** 2026-11-04
- **Decided by:** agent

## Context

Prices change rarely and mistakes are expensive. Inventory and pre-order dates change weekly and
must be editable by the founder without a deploy.

## Decision

- Products, SKUs, prices, colorways and copy live in `src/config/catalog.ts` (typed, reviewed, tested).
- The `inventory` table holds per-SKU `mode` (`in_stock` | `preorder`), `available` (NULL = unlimited),
  `ships_by`, and `active` — editable at `/admin/inventory`.
- A SKU without an inventory row is treated as unavailable (fail closed).

## Consequences

- Price changes are code changes (PR + tests + deploy) — deliberate friction.
- Adding a product requires both a catalog entry and a migration seeding its inventory row
  (see `.claude/skills/add-product`).
- Inventory is per sellable SKU; a Tailgate Pair is tracked separately from singles. Simple for a
  maker who assembles pairs from singles; revisit if component-level stock tracking is needed.
