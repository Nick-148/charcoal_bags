# 0003. Cloudflare D1 as the database

- **Status:** Accepted
- **Date:** 2026-11-04
- **Decided by:** agent

## Context

Needs: orders, inventory, inquiries, webhook idempotency, admin audit log. Low volume (tens to
thousands of orders/month), tight budget, single-region writes are fine.

## Decision

Use Cloudflare D1 (SQLite) bound as `DB`. Raw SQL with bound parameters (no ORM) in a thin typed
query layer (`src/server/db/queries.ts`) and services. Money in integer cents; timestamps ISO-8601 UTC.
Schema changes via append-only `migrations/` applied with `wrangler d1 migrations apply`.

## Consequences

- Free tier covers expected volume for years. Zero extra vendors.
- `db.batch()` gives atomic multi-statement transactions — used for reservations and audit logging.
- No ORM means SQL is explicit and reviewable; integration tests run against real D1 locally.
- Backups: D1 Time Travel (30-day point-in-time restore on paid plans, 7 days free) — see runbook.
