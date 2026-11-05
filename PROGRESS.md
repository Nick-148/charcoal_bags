# PROGRESS — work log

Newest first. One entry per working session: what changed, what was verified, what's next.

## 2026-11-05 — Repo published, production D1 created

- Pushed `main` to https://github.com/Nick-148/charcoal_bags; first CI run green (verify + 14 E2E).
- Founder created the production D1 database; its `database_id` is now in `wrangler.jsonc` (binding
  stays `DB`). `npm run verify` green.
- Added `docs/runbooks/first-time-setup.md`: click-by-click setup for Cloudflare, Turnstile, Resend,
  Stripe (sandbox → live), Access, and an optional custom domain, with a check after each phase and
  troubleshooting keyed to the site's real error messages.

- Founder finished setup Phases 1–4: site live at https://charcoal-bags.nicknickp148.workers.dev, remote
  migrations applied, Turnstile/Resend/Stripe (sandbox) secrets set, public settings in `wrangler.jsonc`.
- Fixed: local builds ignored `PUBLIC_SITE_URL` (it was only read from the shell environment), so the live
  site had no canonical tags or sitemap and robots.txt pointed at a relative, nonexistent sitemap. The build
  now reads it from `wrangler.jsonc` (`scripts/site-url.mjs`; an env var still overrides), and robots.txt
  omits the sitemap line when no URL is known. Tests in `tests/unit/site-url.test.ts`.

**Next:** founder places the Phase 5 test order, then Phase 6 (Access for `/admin`).

## 2026-11-04 — Milestone 1 build

**Decisions (with founder):** Brand = Black Bag Odor Co. (provisional). Shipping flat $4 / free ≥ $30, US only.
Pre-orders charged at checkout. Bulk = automatic tiers + quote form. Host on Cloudflare **Workers**
(Astro's adapter dropped Pages). Answers appended to the founder's brief; ADRs 0001–0016 recorded.

**Built**

- Astro 7 + React 19 islands + Tailwind v4, deployed as one Worker with static assets and a cron trigger.
- Storefront: home, shop, product pages (variant picker, pre-order ship dates, recharge indicator,
  spec sheet, JSON-LD), cart (bulk-tier and free-shipping progress), success page, The Vibe + FAQ,
  bulk/teams page with quote form, contact form, legal templates, 404, sitemap, robots.
- Checkout: server-side re-pricing, atomic inventory reservation (D1 CHECK constraint), Stripe Checkout
  adapter + local fake gateway, idempotent webhook handling, cron reconciliation of abandoned checkouts.
- Admin (`/admin`): dashboard with LLC-trigger tracker, orders list/filters, order detail with
  fulfilment + tracking + refunds (+ restock), shipping CSV export (formula-injection safe), inventory
  editor, inquiries inbox, audit log, config warnings banner.
- Security: Cloudflare Access JWT verification in middleware (fail closed), CSRF via `checkOrigin`,
  zod validation everywhere, Turnstile + rate limiting + honeypot, CSP with hashes, security headers,
  no PII in logs.
- Docs: AGENTS.md, PLAN.md, ADRs, runbooks (deploy, operations), business docs (brand, marketing
  playbook, launch checklist), `.claude/skills/` workflows. CI workflow + Dependabot.

**Verified**

- `npm run verify`: ESLint, Prettier, `astro check` (0 errors), 68 Vitest tests incl. integration
  tests on real local D1 (race-condition over-sell test, idempotent webhooks, refunds, reconciliation).
- `npm run test:e2e`: 14 Playwright tests (desktop + mobile) — full buy → pay → fulfil path, abandoned
  checkout releases stock, admin sell-out reflects on storefront, tampered carts rejected.
- `npm run build`: production build with CSP meta + hashes; manual browser walkthrough of the money path.

**Found & fixed during testing**

- Dev redirect URLs used the configured site URL instead of the serving port → non-production now uses
  the request origin (production still pins `PUBLIC_SITE_URL`).
- Admin fulfilment form lost the selected status after a validation error → now echoes submitted values.

**Pre-commit code review (10 findings, all fixed):** paid orders can no longer be "canceled" without a
refund; no guessed canonical host when `PUBLIC_SITE_URL` is unset; only the stock CHECK maps to 409;
cron alert links never point at localhost; add-to-cart reports quantity clamping; Turnstile `action`
is checked per form; success page only clears the cart for a real order; audit-log helper reused;
home cards no longer claim pre-order statically; redundant CSV filter removed. Final: 68 Vitest +
14 Playwright tests green.

**Next:** founder clears blockers B1–B6 in `PLAN.md`, then follow `docs/runbooks/deploy.md`.
