---
name: pre-commit-review
description: Mandatory self code review before every commit — correctness, security, tests, docs. Use before committing or pushing any change.
---

# Pre-commit review

The brief requires a code review before every commit. Run through this list against `git diff --staged`.

## 1. Automated gate (must pass)

```bash
npm run verify      # eslint, prettier --check, astro check, vitest (unit + integration on real D1)
npm run test:e2e    # playwright, desktop + mobile
npm run build       # production build incl. CSP hashing
```

## 2. Correctness

- [ ] Money: integer cents only. Server recomputes prices. Totals = subtotal + shipping + tax.
- [ ] State transitions are conditional (`WHERE status IN (...)`) and idempotent under retries.
- [ ] Inventory changes happen in the same `db.batch` as the status change they depend on.
- [ ] Error paths: external call failures are caught, logged with ids, and don't corrupt state.
- [ ] `exactOptionalPropertyTypes` and strict null checks are respected without `!` hacks on untrusted data.

## 3. Security

- [ ] All input is validated with zod with size limits. SQL uses bound parameters only.
- [ ] No secrets, keys, or `.dev.vars` content in the diff. No PII in logs.
- [ ] New routes under `/admin` or `/api/admin` rely on the middleware gate. Public mutating routes have
      rate limiting and captcha where appropriate.
- [ ] Output is escaped (Astro auto-escapes; check `set:html`, email templates, CSV, JSON-LD).
- [ ] No new inline styles or scripts, and no new third-party origins without a CSP update and ADR.
- [ ] Dev-only behaviour is refused in production (`parseConfig`).

## 4. Tests and docs

- [ ] New logic has tests. Bug fixes have regression tests.
- [ ] `PLAN.md` status and blockers are updated. `PROGRESS.md` has a dated entry. An ADR exists for
      any significant decision.
- [ ] Brand strings live only in `src/config/site.ts`.

## 5. Commit

Conventional message (`feat:`, `fix:`, `docs:`, `chore:`, `test:`), small focused commits, and push
to a branch then PR (or `main` only for the initial scaffold).
