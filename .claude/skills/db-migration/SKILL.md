---
name: db-migration
description: Create and apply a Cloudflare D1 schema or data migration safely. Use whenever a table, column, index, or seed data changes.
---

# D1 migrations

Rules: migrations are **append-only**. Never edit a file that has been applied anywhere. Money is
integer cents, timestamps are ISO-8601 UTC strings, and enumerations get `CHECK` constraints.

1. Create the next numbered file: `migrations/000N_short_description.sql` (or
   `npx wrangler d1 migrations create DB short_description`).
2. Write forward-only SQL. SQLite can't drop or alter constraints in place. For those, create a new
   table, copy the data, drop the old one, and rename, all in one migration.
3. Keep statements separated by `;` at the end of a line. The test harness (`tests/integration/db.ts`)
   splits on that. Avoid triggers (inner semicolons).
4. Update the TypeScript row types in `src/server/db/queries.ts` and any affected services.
5. Apply locally and test:
   ```bash
   npm run db:migrate:local
   npm run verify
   npm run test:e2e
   ```
6. If you add a table, add it to `TABLES` in `tests/integration/db.ts` so tests reset it.
7. Deploy code that works with **both** old and new schema when possible, then
   `npm run db:migrate:remote`. For destructive changes, take a D1 export first:
   `npx wrangler d1 export charcoal-bags --remote --output backup.sql`.
8. Record notable schema decisions in an ADR. Log the change in `PROGRESS.md`.
