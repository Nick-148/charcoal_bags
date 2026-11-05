# charcoal-bags

Storefront, checkout, and admin for **Black Bag Odor Co.** (provisional name): mini cornhole-style
canvas bags filled with activated bamboo charcoal. They kill sneaker and gym-bag funk without
perfume and double as a desk toss.

- **Stack:** Astro 7 · React 19 islands · Tailwind CSS v4 · Cloudflare Workers + D1 · Stripe Checkout ·
  Cloudflare Access · Turnstile · Resend
- **Status and roadmap:** [PLAN.md](PLAN.md) · **Log:** [PROGRESS.md](PROGRESS.md) · **Decisions:** [docs/adr](docs/adr/README.md)
- **Contributing (humans and AI agents):** [AGENTS.md](AGENTS.md)

## Quick start

Requires Node 22.12+ (see `.nvmrc`). No Stripe, Resend, or Cloudflare account needed for local work.

```bash
npm install
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run dev
```

- Store: http://localhost:4321
- Admin: http://localhost:4321/admin (local dev-bypass, no login)
- Checkout uses a **fake gateway** locally. Click "Simulate successful payment" on the stand-in page.

## Scripts

| Script                      | Does                                                                   |
| --------------------------- | ---------------------------------------------------------------------- |
| `npm run dev`               | Dev server on workerd with a local D1                                  |
| `npm run verify`            | ESLint + Prettier check + `astro check` + unit/integration tests       |
| `npm run test:e2e`          | Playwright (desktop and mobile) against an isolated throwaway database |
| `npm run build`             | Production build (typechecks first)                                    |
| `npm run preview`           | Serve the production build locally (CSP active)                        |
| `npm run db:migrate:local`  | Apply D1 migrations locally                                            |
| `npm run db:migrate:remote` | Apply D1 migrations to production                                      |

## How it fits together

```
Browser ──► Cloudflare Worker (src/worker.ts)
              ├─ static assets: prerendered marketing pages, JS/CSS (public/_headers)
              ├─ Astro SSR: /shop, /cart, /checkout/*, /contact, /bulk, /admin/*  (src/middleware.ts)
              │     └─ services (src/server/services) ──► D1 (orders, inventory, inquiries, audit)
              │                                     ├──► Stripe Checkout (payments)
              │                                     ├──► Resend (alerts)
              │                                     └──► Turnstile (bot checks)
              └─ cron */15 ─► reconcile abandoned checkouts with Stripe, release stock
Stripe ──webhook──► /api/stripe/webhook (signature-verified, idempotent)
Cloudflare Access ──► /admin (JWT re-verified in the Worker)
```

## Deploying

First time? Start with [docs/runbooks/first-time-setup.md](docs/runbooks/first-time-setup.md), a
click-by-click guide from zero accounts to live payments. Short reference:
[docs/runbooks/deploy.md](docs/runbooks/deploy.md). Summary: create the D1 database, set secrets,
connect the GitHub repo to Workers Builds, add the Stripe webhook, and protect `/admin` with Cloudflare
Access.

## Operating the business

- Weekly fulfilment, refunds, and pre-order batches: [docs/runbooks/operations.md](docs/runbooks/operations.md)
- Brand guide and how to rebrand: [docs/business/brand.md](docs/business/brand.md)
- Marketing playbook (zero ad spend): [docs/business/marketing-playbook.md](docs/business/marketing-playbook.md)
- Launch and compliance checklist: [docs/business/launch-checklist.md](docs/business/launch-checklist.md)
