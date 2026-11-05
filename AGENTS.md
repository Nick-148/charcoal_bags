# AGENTS.md — how to work on this repo

Guidelines for any AI agent or human contributing to the Black Bag Odor Co. storefront. Read this
first, then `PLAN.md` (what's next) and the ADRs in `docs/adr/` (why things are the way they are).

## Project in one paragraph

A production e-commerce site for mini cornhole-style activated-charcoal bags. Astro 7 (static
marketing pages + on-demand commerce/admin pages) with React islands for the cart, styled with
Tailwind v4, deployed as a single Cloudflare Worker with static assets. Cloudflare D1 stores orders,
inventory and inquiries. Stripe Checkout takes payments (including Founder's Pre-Orders). Admin
lives at `/admin`, protected by Cloudflare Access and re-verified in the Worker. The founder works
~10 hrs/week, so **operational simplicity beats cleverness**.

## Map

| Path                                           | What lives there                                                                     |
| ---------------------------------------------- | ------------------------------------------------------------------------------------ |
| `src/config/site.ts`                           | Brand name, tagline, copy, contact placeholders. **Only place brand strings live.**  |
| `src/config/catalog.ts`                        | Products, variants (SKUs), prices, colorways, specs.                                 |
| `src/config/commerce.ts`                       | Shipping, bulk tiers, order limits, tax flag, profit estimates.                      |
| `src/styles/global.css`                        | Semantic theme tokens (`surface`, `fg`, `accent`…) and custom utilities.             |
| `src/lib/`                                     | Pure, isomorphic logic (pricing, availability, money). Used by browser + server.     |
| `src/components/`                              | Astro components; `cart/` holds React islands + the nanostores cart.                 |
| `src/pages/`                                   | Routes. `api/` = JSON endpoints, `admin/` = dashboard, `checkout/` = flows.          |
| `src/server/`                                  | Server-only code. **Never import from client islands.**                              |
| `src/server/runtime.ts`                        | The only module (with `src/worker.ts`) that reads Cloudflare `env`.                  |
| `src/server/services/`                         | Business logic with injected deps (orders, inquiries, admin).                        |
| `src/server/{payments,email,captcha}`          | Ports + adapters (real + fake) for external services.                                |
| `src/middleware.ts`                            | Admin auth gate + security headers for SSR responses.                                |
| `src/worker.ts`                                | Worker entry: Astro `fetch` + cron `scheduled` reconciliation.                       |
| `migrations/`                                  | D1 SQL migrations (append-only).                                                     |
| `tests/unit`, `tests/integration`, `tests/e2e` | Vitest (pure), Vitest + real local D1, Playwright.                                   |
| `docs/adr/`                                    | Architecture Decision Records.                                                       |
| `docs/runbooks/`                               | Deploy + day-to-day operations.                                                      |
| `docs/business/`                               | Brand guide, marketing playbook, launch/compliance checklist.                        |
| `.claude/skills/`                              | Repeatable workflows (add a product, migrations, deploy, review, rebrand, blockers). |

## Commands

```bash
cp .dev.vars.example .dev.vars   # once: local config (fake payments, console email, dev admin)
npm run db:migrate:local         # once + after adding migrations
npm run dev                      # http://localhost:4321  (admin at /admin via localhost dev-bypass)
npm run verify                   # lint + format check + typecheck + unit/integration tests
npm run test:e2e                 # Playwright against an isolated throwaway D1
npm run build                    # production build (also typechecks)
```

`npm run verify` and `npm run test:e2e` must pass before every commit.

## Non-negotiable rules

### Security

1. **Server is the source of truth for money.** Prices, tiers, shipping and totals are recomputed
   server-side from `src/config` in `createCheckout`. Never accept a price from the client.
2. **All SQL uses bound parameters.** The only interpolated SQL fragments are compile-time constants
   (e.g. `ORDER_FILTERS`) — keep it that way and comment why when you add one.
3. **Validate every input with zod** (`src/server/validation.ts`) and cap sizes (`readJson` limit).
4. **Fail closed.** Missing Access config → admin is 503, not open. Captcha errors → reject.
   Development-only providers (`fake`, `disabled`, `dev-bypass`) are refused when `ENVIRONMENT=production`.
5. **No secrets in git.** Secrets go in `wrangler secret put` (prod) and `.dev.vars` (local, gitignored).
6. **No PII in logs.** Log ids (`orderId`, `inquiryId`), never emails, names, addresses or message bodies.
7. **Escape everything rendered outside Astro's auto-escaping**: email templates use `esc()`, CSV uses
   `csvCell()` (formula-injection safe), JSON-LD escapes `<`.
8. **CSP stays strict.** No inline `style=""` attributes or inline scripts without `is:inline` + a
   reason. New third-party origins need an ADR and a `security.csp` update in `astro.config.mjs`.
9. Webhooks are verified by signature (`parseWebhookEvent`) and processed **idempotently**.

### Reliability

- Every state transition is a **conditional UPDATE** (`WHERE payment_status IN (...)`) so retries and
  overlapping cron runs are no-ops. Inventory changes happen in the same `db.batch` (one transaction)
  as the status change they belong to.
- External calls (Stripe, Resend, Turnstile) have timeouts. A failed alert email must never fail the
  request that triggered it.
- Migrations are append-only. Never edit a migration that has been applied anywhere; add a new one.

### Code style

- TypeScript strictest. No `any`; narrow unknown input with zod or type guards.
- Pure logic in `src/lib` / services with injected deps; adapters at the edges. Business logic must be
  testable without Cloudflare (`tests/integration` uses a real local D1 via `getPlatformProxy`).
- Match the surrounding code: comment _why_, not _what_. Keep functions small and named for intent.
- Styling uses semantic tokens (`bg-surface`, `text-accent`) — never hard-coded brand hex values in
  components. Product colorways are data in `catalog.ts`, not theme.
- Accessibility: semantic HTML, labelled inputs, visible focus, `aria-live` for async updates,
  44px touch targets (`btn` utility), test at mobile width.

### Testing

- New business logic → unit or integration test in the same change. Bugs → regression test first.
- Integration tests run against real SQLite/D1 semantics; don't mock the database.
- E2E covers the money path (cart → checkout → paid → fulfil). Keep it green.

## Workflow

1. Check `PLAN.md` for the current milestone and open blockers.
2. Make the change on a branch (`feat/…`, `fix/…`, `docs/…`).
3. Run `npm run verify` and `npm run test:e2e`.
4. **Review before committing** — follow `.claude/skills/pre-commit-review/SKILL.md`.
5. Record significant decisions as a new ADR (`docs/adr/NNNN-title.md`, see the template).
6. Append a dated entry to `PROGRESS.md`; update status/checkboxes in `PLAN.md`.
7. Commit with a conventional message (`feat: …`, `fix: …`, `docs: …`) and push.

## When blocked

Never stall on an external dependency (missing API key, account, decision from the founder, asset):

1. **Document it** in `PLAN.md → Blockers` (what, why it blocks, who can unblock, date).
2. **Stub it behind an interface** — a port in `src/server/*` with a fake/console adapter selected by
   config, refused in production if unsafe (see `PaymentGateway`, `EmailSender`, `CaptchaVerifier`).
3. **Move on** to the next unblocked task. Log it in `PROGRESS.md`.

The full procedure is in `.claude/skills/handle-blocker/SKILL.md` and ADR 0015.

## Business context agents should keep in mind

- Pricing: $9 single, $18 Tailgate Pair, bulk tiers 10+ bags $7.50/bag and 25+ $6.50/bag. COGS ≈ $1.50/bag.
- Founder's Pre-Orders charge at checkout and must show a ship-by date (FTC Mail Order Rule).
- US-only shipping: flat $4, free at $30+.
- The brand name is **provisional** — never hard-code it outside `src/config/site.ts`.
- Product is "not a children's toy, 14+" — keep that language; avoid health/antibacterial claims.
- File the NH LLC at the first $500 net profit (the admin dashboard tracks an estimate).
