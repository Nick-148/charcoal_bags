# 0006. Inventory reservations & reconciliation

- **Status:** Accepted
- **Date:** 2026-11-04
- **Decided by:** agent

## Context

Batches are small (e.g. 10 Field Mix pairs). Two people buying the last unit at once must not both
succeed, and abandoned checkouts must not lock stock forever.

## Decision

- `inventory.available` has `CHECK (available IS NULL OR available >= 0)`.
- `createCheckout` inserts the order, decrements `available`, and inserts items in **one `db.batch`**.
  If any decrement would go negative, the CHECK fails and the entire batch rolls back → 409.
- Each order item records `reserved` so release returns exactly what was taken; `orders.inventory_released`
  makes release idempotent, guarded by the payment status in the same transaction.
- Release triggers: `checkout.session.expired`, async payment failure, gateway error during creation,
  and admin refund with "restock".
- **Cron backstop** (`*/15 * * * *`): pending orders whose session expired >10 minutes ago are
  reconciled by asking Stripe for the session's real state (expired → release; complete → mark paid).
- A payment that arrives after release is still recorded as paid and flagged `needs_review`.

## Consequences

- Over-selling is impossible at the database level (covered by an integration test that simulates
  the race). Stock is held for at most ~31 minutes per abandoned checkout.
