# Runbook: deploy to Cloudflare

First deploy takes about an hour. Do it in **Stripe test mode** first, then switch to live keys.

> **First time, or no accounts yet?** Follow [first-time-setup.md](first-time-setup.md) instead: the
> same steps, click by click, in order, with a check at the end of each phase. This page is the short
> reference.

## 0. Prerequisites

- Cloudflare account (free plan is fine), Stripe account, Resend account.
- Locally: `npx wrangler login`.

## 1. Database

```bash
npx wrangler d1 create charcoal-bags
```

Copy the printed `database_id` into `wrangler.jsonc` under `d1_databases[0].database_id` and commit it.
Then apply the migrations:

```bash
npm run db:migrate:remote
```

Re-run the migrate command whenever `migrations/` gets a new file. It is safe to run repeatedly.

## 2. First deploy (creates the Worker)

```bash
npm run deploy
```

Note the URL, e.g. `https://charcoal-bags.<your-subdomain>.workers.dev`. Put it in `wrangler.jsonc → vars.PUBLIC_SITE_URL`
and commit.

## 3. Secrets

```bash
npx wrangler secret put STRIPE_SECRET_KEY       # sk_test_… first, sk_live_… at launch
npx wrangler secret put STRIPE_WEBHOOK_SECRET   # from step 4
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put TURNSTILE_SECRET_KEY
```

Non-secret vars go in `wrangler.jsonc → vars`: `ALERT_EMAIL_TO` (your email), `TURNSTILE_SITE_KEY`,
`ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, and optionally `ADMIN_EMAILS`.

## 4. Stripe

1. Dashboard → Developers → Webhooks → **Add endpoint**: `https://<PUBLIC_SITE_URL>/api/stripe/webhook`.
2. Events: `checkout.session.completed`, `checkout.session.expired`,
   `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `charge.refunded`.
3. Copy the signing secret → `wrangler secret put STRIPE_WEBHOOK_SECRET`.
4. Settings → Customer emails → enable **Successful payments** and **Refunds** (customer receipts).
5. Settings → Public details: set the business name, support email, and statement descriptor.

## 5. Turnstile

Cloudflare dashboard → Turnstile → Add widget for your workers.dev hostname (Managed mode). Put the
site key in `vars.TURNSTILE_SITE_KEY` and the secret in `wrangler secret put TURNSTILE_SECRET_KEY`.

## 6. Cloudflare Access for /admin

1. Zero Trust → Settings: note your team domain `https://<team>.cloudflareaccess.com`.
2. Access → Applications → Add → **Self-hosted**:
   - Destinations: `<worker>.<subdomain>.workers.dev/admin` **and** `<worker>.<subdomain>.workers.dev/admin/*`
     (add `/api/admin/*` too if admin APIs are added later).
   - Policy: **Allow** → Emails → your email only. Login method: One-time PIN (or Google).
3. Copy the application's **AUD tag** → `vars.ACCESS_AUD`; team domain → `vars.ACCESS_TEAM_DOMAIN`.
4. Optional: `vars.ADMIN_EMAILS = "you@example.com"` as a second check.

> If the dashboard refuses a path-scoped app on a `workers.dev` hostname, the admin stays locked
> (it fails closed, which is safe). Add a custom domain to the Worker (Workers → Settings → Domains)
> and create the Access app on `yourdomain.com/admin` instead. See ADR 0007.

## 7. Continuous deployment from GitHub

Workers & Pages → `charcoal-bags` → Settings → Builds → **Connect** the GitHub repo
`Nick-148/charcoal_bags`.

- Build command: `npm ci && npm run build`
- Deploy command: `npx wrangler deploy`
- **Build variable:** `PUBLIC_SITE_URL=https://charcoal-bags.<subdomain>.workers.dev` (canonical URLs,
  sitemap and robots.txt are generated at build time from it).
- Production branch: `main`. Non-production branches get preview URLs. Protect those with Access too
  (Worker settings → Domains & Routes → Preview URLs → Enable Cloudflare Access).

GitHub Actions (`.github/workflows/ci.yml`) runs lint, typecheck, tests, build, and E2E on every push.
Only merge to `main` when it's green.

## 8. Smoke test (test mode)

1. Place an order with card `4242 4242 4242 4242`. Confirm the success page shows the order number.
2. Check that the order shows **paid** in `/admin/orders` and that the alert email arrived.
3. Refund it from the admin. Confirm Stripe shows the refund and the order shows **refunded**.
4. Submit the contact form. Confirm it lands in `/admin/inquiries` and you get an email.
5. Visit `/admin` in a private window. Confirm Access asks you to log in.
6. Check the admin warning banner: it should be empty in production.

Then swap `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` for live values (create a live-mode webhook
endpoint). Place one real order and refund it.

## Rollback

- Code: Workers → Deployments → **Rollback** to a previous version (instant).
- Data: D1 → Time Travel restore (`wrangler d1 time-travel restore charcoal-bags --timestamp=…`).
  Restores the whole database, so export first if unsure.
