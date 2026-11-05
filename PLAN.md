# PLAN — roadmap & current status

_Last updated: 2026-11-04_

## Current status

**Milestone 1 (MVP storefront + ops) is code-complete and tested locally.** The store runs end to
end on a laptop with zero accounts (fake payments, console email, localhost admin). Going live is
gated on the account setup in **Blockers** below, then the steps in `docs/runbooks/deploy.md`.

| Area                          | Status | Notes                                                         |
| ----------------------------- | ------ | ------------------------------------------------------------- |
| Home / Shop / PDP / The Vibe  | ✅     | SVG product art until real photos exist                       |
| Cart + bulk tiers + shipping  | ✅     | Server re-prices everything at checkout                       |
| Stripe Checkout + pre-orders  | ✅     | Fake gateway locally; Stripe adapter needs keys               |
| Inventory reservations + cron | ✅     | Over-sell proof (DB CHECK); 15-min reconciliation             |
| Contact + bulk quote forms    | ✅     | Turnstile + rate limit + honeypot                             |
| Admin dashboard               | ✅     | Orders, fulfilment, refunds, inventory, inquiries, CSV, audit |
| Email alerts                  | ✅     | Resend adapter needs key; console fallback                    |
| Security headers / CSP        | ✅     | Verified in production build                                  |
| Tests                         | ✅     | 68 unit/integration (real D1) + 14 Playwright E2E             |
| CI (GitHub Actions)           | ✅     | verify + build + E2E on every push/PR                         |
| Production deploy             | ⛔     | Blocked on accounts (below)                                   |

## Blockers

Each blocker is stubbed behind an interface so development continues (ADR 0015).

| #   | Blocker                                                                           | Unblocked by | Stub in place                               | Since      |
| --- | --------------------------------------------------------------------------------- | ------------ | ------------------------------------------- | ---------- |
| B1  | Cloudflare: D1 created and migrated, Worker deployed ✅ — Workers Builds optional | Founder      | Local D1 via wrangler                       | 2026-11-04 |
| B2  | Stripe: sandbox keys + webhook set ✅ — activation, live keys, live webhook       | Founder      | `PAYMENTS_PROVIDER=fake`                    | 2026-11-04 |
| B3  | Resend: API key set ✅ — verified domain later (needs custom domain)              | Founder      | `EMAIL_PROVIDER=console`                    | 2026-11-04 |
| B4  | Turnstile widget for the workers.dev hostname ✅ (done 2026-11-05)                | Founder      | Cloudflare test keys                        | 2026-11-04 |
| B5  | Cloudflare Access app for `/admin` (team domain + AUD); may need a custom domain  | Founder      | localhost `dev-bypass`                      | 2026-11-04 |
| B6  | Real contact email, social handles, ship-by date for Batch 01                     | Founder      | Placeholders in `src/config/site.ts` + seed | 2026-11-04 |
| B7  | Final brand name + USPTO trademark search                                         | Founder      | Provisional "Black Bag Odor Co."            | 2026-11-04 |
| B8  | Product photos (and an OG/social share image)                                     | Founder      | SVG `BagArt` illustrations                  | 2026-11-04 |
| B9  | Review of legal page templates (privacy, terms, shipping/returns)                 | Founder      | Template copy in `src/pages/legal/`         | 2026-11-04 |

## Roadmap

### Milestone 1 — MVP storefront & operations ✅ (code)

- [x] Brand direction chosen (provisional) and themed
- [x] Storefront, cart, pre-order checkout, bulk tiers, quote form
- [x] Admin: orders, fulfilment, refunds, inventory, inquiries, shipping CSV, audit log, LLC tracker
- [x] Security hardening, tests, CI, docs, ADRs, skills

### Milestone 2 — Go live (target: as soon as B1–B6 clear)

- [ ] Clear B1–B6, follow `docs/runbooks/deploy.md`
- [ ] Stripe **test mode** end-to-end on workers.dev (real webhook, real Turnstile, Access on /admin)
- [ ] Place one real live-mode order and refund it
- [ ] Turn on Cloudflare Web Analytics (`site.analyticsToken`)
- [ ] Open Founder's Pre-Orders; start the content plan in `docs/business/marketing-playbook.md`

### Milestone 3 — Polish after first sales

- [ ] Real product photos + OG image (B8); per-variant images on PDP
- [ ] Customer shipping-confirmation email with tracking link (needs verified email domain)
- [ ] Custom domain (after the name is final) — simplifies Access and email deliverability
- [ ] Reviews / "field reports" section with real, permissioned customer content
- [ ] Discount codes for campus ambassadors (Stripe promotion codes)

### Milestone 4 — Scale (months 4–12)

- [ ] Wholesale/retail price list + net-30 invoicing (Stripe Invoices)
- [ ] Stripe Tax when nexus thresholds approach (ADR 0014)
- [ ] Component-level inventory (bags → pairs) if assembly becomes a bottleneck
- [ ] File the NH LLC at the first $500 net profit (tracked on the admin dashboard) and update
      `site.legalName`
