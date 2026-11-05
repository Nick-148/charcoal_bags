# First-time setup: from zero accounts to taking real orders

This is the beginner, click-by-click version of [deploy.md](deploy.md). Follow the phases **in order**.
Each phase ends with a check so you know it worked before moving on. Plan on about 3 hours total,
spread over a few sittings. Phases 1–5 get a working store in **test mode** (fake cards, no real money)
and need no domain.

| Phase | What                                           | Time   | Cost                         |
| ----- | ---------------------------------------------- | ------ | ---------------------------- |
| 1     | Put the site online (Cloudflare)               | 15 min | Free                         |
| 2     | Bot protection on forms (Turnstile)            | 5 min  | Free                         |
| 3     | Order alert emails (Resend)                    | 10 min | Free (100 emails/day)        |
| 4     | Payments in test mode (Stripe)                 | 30 min | Free                         |
| 5     | Redeploy and place a test order                | 15 min | Free                         |
| 6     | Lock the admin with Cloudflare Access          | 20 min | Free (needs a card on file)  |
| 7     | Replace the placeholders (contact, ship date…) | 20 min | Free                         |
| 8     | Custom domain (optional, once the name is set) | 30 min | About $10–15/year            |
| 9     | Go live with real payments                     | 45 min | Stripe takes 2.9% + 30¢/sale |
| 10    | Auto-deploy from GitHub (optional)             | 10 min | Free                         |

## Before you start

**Two kinds of values.** Every service gives you some values. Treat them differently:

- **Secrets** (Stripe secret key, Stripe webhook secret, Resend API key, Turnstile secret key) are like
  passwords. Never paste them into a chat, an email, or a file in this repo. You type them straight into
  Cloudflare with `npx wrangler secret put NAME`, which saves them encrypted on the Worker.
- **Public settings** (your site URL, Turnstile site key, alert email, Access team domain and AUD tag)
  are safe to share. They live in `wrangler.jsonc` under `"vars"`. You can edit that file yourself, or
  send the values to Claude and it will update the file for you.

**Running commands.** Every command below runs from the project folder. Open a terminal (the Terminal
panel in the Claude app, or the macOS Terminal app) and start with:

```bash
cd ~/Developer/charcoal-bags
```

When `wrangler secret put` asks `Enter a secret value:`, paste the secret and press Enter. Nothing
shows while you paste. That's normal.

**Keep a notes file of the public values** as you go (site URL, Turnstile site key, team domain, AUD
tag). You'll need them again in later phases.

**What Claude can do for you:** edit `wrangler.jsonc` with the public values, run deploys and
migrations (with your OK), read the live logs, and test the site. **What only you can do:** create
accounts, enter card, ID, and bank details, and paste secrets into `wrangler secret put`.

---

## Phase 1: Put the site online (Cloudflare, 15 min)

You already have a Cloudflare account and the production database (its id is in `wrangler.jsonc`).

### 1.1 Check that Wrangler is logged in

```bash
npx wrangler whoami
```

You should see your email and account name. If it says you're not logged in, run `npx wrangler login`,
approve in the browser window that opens, then run `whoami` again.

### 1.2 Create the database tables

```bash
npm run db:migrate:remote
```

It lists two migrations (`0001_init.sql`, `0002_seed_inventory.sql`) and asks to apply them. Type
`y` and press Enter. Both should show ✅. This creates the order, inventory, and inquiry tables and the
eight starting product variants.

### 1.3 First deploy

```bash
npm run deploy
```

This builds the site (about a minute) and uploads it. If this is the first Worker on your account,
Wrangler asks you to **choose a workers.dev subdomain**. Pick something short and brand-neutral, like
your name (for example `nickp`), because the brand may change. Your store's address becomes:

```
https://charcoal-bags.<your-subdomain>.workers.dev
```

Wrangler prints this URL at the end. **Write it down.** If you open it in the first minute and get an
error page (523), wait a minute and refresh.

### 1.4 Save the site URL in the config

Put the URL in `wrangler.jsonc → "vars" → "PUBLIC_SITE_URL"` (no trailing slash), or send it to Claude
to do. Don't redeploy yet; you'll deploy once at the end of Phase 4 with everything together.

**Check:** the URL shows the home page and the shop. Checkout says "Checkout is temporarily offline",
the contact form won't send, and `/admin` says "Admin is not configured yet". That's expected: anything
not configured stays **locked**, not open.

> Do **not** turn on "Cloudflare Access" in the Worker's own settings (Settings → Domains & Routes →
> workers.dev). That switch locks the **whole** site, store included. Phase 6 locks just `/admin`.

---

## Phase 2: Bot protection on forms (Turnstile, 5 min)

Turnstile is Cloudflare's free, mostly invisible "are you human?" check on the contact and bulk-quote
forms.

1. Go to [dash.cloudflare.com](https://dash.cloudflare.com) and pick your account.
2. In the left sidebar, open **Turnstile**. (Can't find it? Type "Turnstile" into the search bar at the
   top of the dashboard.)
3. Click **Add widget**.
4. **Widget name:** `charcoal-bags store`.
5. **Hostnames:** add `charcoal-bags.<your-subdomain>.workers.dev`. Hostname only: no `https://`, no
   slash, no path.
6. **Widget mode:** **Managed**.
7. If asked about **pre-clearance**, choose **No**.
8. Click **Create**.
9. You now see two keys:
   - **Site key** (public): copy it into your notes. It goes in `"TURNSTILE_SITE_KEY"`.
   - **Secret key**: run this and paste it when asked:

     ```bash
     npx wrangler secret put TURNSTILE_SECRET_KEY
     ```

**Check:** the command prints `✨ Success! Uploaded secret TURNSTILE_SECRET_KEY`.

---

## Phase 3: Order alert emails (Resend, 10 min)

The store emails **you** when an order or message comes in. Customers get receipts from Stripe, not
from Resend, so you don't need a domain for this yet.

1. Go to [resend.com](https://resend.com) and **sign up with the email address where you want order
   alerts.** This matters: until you add your own domain (Phase 8), Resend can only send to the email
   on your Resend account.
2. Verify your email (click the link Resend sends you).
3. Skip any "add a domain" prompt for now.
4. Go to **API Keys** → **Create API Key**.
   - **Name:** `charcoal-bags production`
   - **Permission:** **Sending access** (it can send email and nothing else)
   - **Domain:** All domains
5. Click **Add**. The key (it starts with `re_`) is **shown only once**. Run this right away and paste
   it:

   ```bash
   npx wrangler secret put RESEND_API_KEY
   ```

6. Put your Resend sign-up email in `"ALERT_EMAIL_TO"` in `wrangler.jsonc` (or send it to Claude).

Leave `"EMAIL_FROM"` as it is (`…<onboarding@resend.dev>`). That's Resend's shared test sender, and it
works until you verify your own domain.

**Check:** the `secret put` command printed Success. Phase 5 tests a real alert.

---

## Phase 4: Payments in test mode (Stripe, 30 min)

Test mode uses fake card numbers, so you can try the whole checkout without real money. Stripe calls the
test environment a **sandbox**. Its keys start with `sk_test_`; live keys start with `sk_live_`.

### 4.1 Create the account

1. Go to [stripe.com](https://stripe.com) → **Sign up**. Use your email and a strong password.
   Country: **United States**.
2. Verify your email and set up two-step login when asked (use an authenticator app if you can).
3. Stripe will push you to **activate payments** (business details, bank, ID). **Skip it for now**
   ("I'll do this later" or close the prompt). Test mode doesn't need it. You'll do it in Phase 9.

### 4.2 Make sure you're in the sandbox (test mode)

New accounts usually open in a sandbox. Look for a **Sandbox** or **Test mode** label at the top of
the dashboard. If you don't see one, use the account menu in the top-left to switch to a sandbox, or
create one ("Create sandbox"). **Stay in the sandbox for the rest of this phase.**

### 4.3 Copy the secret key

1. Open **Developers** (bottom of the left sidebar) → **API keys**. Or type "API keys" in the
   dashboard search.
2. Under **Standard keys**, find **Secret key** → **Reveal** → copy. It must start with `sk_test_`.
3. Run this and paste it:

   ```bash
   npx wrangler secret put STRIPE_SECRET_KEY
   ```

You don't need the publishable key (`pk_test_…`); this site never uses it.

### 4.4 Add the webhook (how Stripe tells the store "this order was paid")

1. Open **Developers** → **Webhooks**. In newer accounts this opens a panel called **Workbench**.
2. Click **Add destination** (sometimes labelled **Create an event destination**).
3. **Events from:** **Your account**.
4. **API version:** leave the newest version selected (the default). The code expects `2026-10-28` or
   later.
5. **Events:** use the search box to find and tick exactly these five:
   - `checkout.session.completed`
   - `checkout.session.expired`
   - `checkout.session.async_payment_succeeded`
   - `checkout.session.async_payment_failed`
   - `charge.refunded`
6. **Continue** → destination type **Webhook endpoint** → **Continue**.
7. **Endpoint URL:**

   ```
   https://charcoal-bags.<your-subdomain>.workers.dev/api/stripe/webhook
   ```

   **Description:** `store orders`. Then click **Create destination**.

8. On the new destination's page, find **Signing secret** → **Reveal** → copy (it starts with `whsec_`).
   Run this and paste it:

   ```bash
   npx wrangler secret put STRIPE_WEBHOOK_SECRET
   ```

> The secret key and the webhook secret must come from the **same** mode. Test key + test webhook
> now; live key + live webhook in Phase 9. A mismatch means orders never get marked paid.

**Check:** both `secret put` commands printed Success.

---

## Phase 5: Redeploy and place a test order (15 min)

### 5.1 Update the config and deploy

By now `wrangler.jsonc → "vars"` should have:

| Setting              | Value                                                |
| -------------------- | ---------------------------------------------------- |
| `PUBLIC_SITE_URL`    | `https://charcoal-bags.<your-subdomain>.workers.dev` |
| `TURNSTILE_SITE_KEY` | the Turnstile **site** key from Phase 2              |
| `ALERT_EMAIL_TO`     | your Resend sign-up email                            |

Then deploy (or ask Claude to):

```bash
npm run deploy
```

Secrets don't need a redeploy; settings in `wrangler.jsonc` do.

### 5.2 Buy something with a fake card

1. Open your store URL in a normal browser window.
2. Add a Single to the cart → **Checkout**. You land on Stripe's checkout page, which should show a
   test-mode label.
3. Pay with:
   - Card: `4242 4242 4242 4242`
   - Expiry: any future date (e.g. `12/30`) · CVC: any 3 digits · ZIP: any 5 digits
   - Shipping address: any US address
4. You should land on the **success page with an order number** like `BB-7KQ2MX`.
5. Within a minute you should get an **order alert email** (check spam the first time).
6. In Stripe (sandbox) → **Transactions** (or **Payments**), the $13 payment shows as succeeded.
7. Back in Stripe → **Developers → Webhooks** → your destination → **Event deliveries**: the
   `checkout.session.completed` event should show a **200** response.

### 5.3 Try the contact form

Go to `/contact`, send yourself a test message, and check that the alert email arrives.

**Check:** the order number appeared, both alert emails arrived, and the webhook shows 200. If not,
see [Troubleshooting](#troubleshooting).

---

## Phase 6: Lock the admin with Cloudflare Access (20 min)

The admin (`/admin`) shows orders, addresses, and inventory, so only you should reach it. Cloudflare
Access puts a login screen in front of it (it emails you a one-time code), and the site double-checks
that login itself.

### 6.1 Turn on Zero Trust (one time)

1. In the Cloudflare dashboard left sidebar, open **Zero Trust**.
2. **Team name:** pick something like `blackbag-ops`. It becomes `https://<team>.cloudflareaccess.com`.
   Write the full address in your notes.
3. **Plan:** choose **Free** (up to 50 users).
4. Cloudflare asks for a payment card even on the free plan. **You won't be charged.** Enter it yourself
   and finish.

### 6.2 Create the admin application

1. In Zero Trust, go to **Access** (or **Access controls**) → **Applications** → **Add an
   application** → **Self-hosted**.
2. **Application name:** `Store admin`. **Session duration:** 24 hours.
3. Under **Public hostname / Destinations**, add **two** entries. Both are needed: one for the
   `/admin` page itself and one for everything under it.
   - Domain `charcoal-bags.<your-subdomain>.workers.dev`, Path `admin`
   - Domain `charcoal-bags.<your-subdomain>.workers.dev`, Path `admin/*`

   If there's a separate "subdomain" box and the form won't accept the workers.dev address, see the
   note at the end of this phase.

4. **Policies** → **Add a policy**:
   - Name: `Founder only` · Action: **Allow**
   - Include → **Emails** → your email address
   - Save the policy.
5. **Login methods:** leave **One-time PIN** on. It emails you a code; no password needed.
6. Save the application.

### 6.3 Copy the two values the site needs

1. Open the `Store admin` application → its overview / basic information → copy the
   **Application Audience (AUD) Tag** (a long string of letters and numbers).
2. Put these in `wrangler.jsonc → "vars"` (or send them to Claude; neither is secret):

   | Setting              | Value                                        |
   | -------------------- | -------------------------------------------- |
   | `ACCESS_TEAM_DOMAIN` | `https://<team>.cloudflareaccess.com`        |
   | `ACCESS_AUD`         | the AUD tag                                  |
   | `ADMIN_EMAILS`       | your email (optional extra check, see below) |

   `ADMIN_EMAILS` makes the site itself refuse anyone not on that list, even if the Access policy is
   ever loosened by mistake.

3. `npm run deploy`

### 6.4 Test it

1. Open a **private/incognito** window and go to `https://…workers.dev/admin`.
2. You should see a Cloudflare login page. Enter your email, then the code it sends you.
3. You should land on the dashboard and see your test order from Phase 5. If a warning banner shows
   at the top, it names the setting that's still missing.
4. In the same private window, open the home page. It must load **without** a login. Only `/admin` is
   locked.

**Check:** the admin needs a login, and the store doesn't.

> **If Cloudflare refuses the workers.dev address** in step 6.2, the admin simply stays locked (safe).
> Do Phase 8 (custom domain) first, then create the application on `yourdomain.com` with the same two
> paths. See ADR 0007.

---

## Phase 7: Replace the placeholders (20 min, with Claude)

The site has placeholders that must be real before customers see it (Stripe also checks your site
before it lets you take real money). Send Claude:

1. **Support email** customers can write to (replaces `support@example.com`). A free Gmail like
   `blackbagodor.help@gmail.com` is fine for now.
2. **Wholesale email** (or the same one).
3. **Social handles** you've claimed (or "none yet").
4. **Batch 01 ship-by date**: the latest date you can promise pre-orders will ship. The law (the FTC
   Mail Order Rule) requires you to ship by the date you state, or tell the customer and offer a refund.
   Be conservative.
5. **Stock caps per variant**: how many of each you can make for Batch 01. You can also change these
   any time in **Admin → Inventory**.

Also do these yourself:

- **Name check:** search your brand name at [tmsearch.uspto.gov](https://tmsearch.uspto.gov) before you
  buy a domain or print anything. If it's taken in a related category, tell Claude to rebrand. The
  rebrand skill changes it everywhere.
- **Policy pages:** read `/legal/privacy`, `/legal/terms`, and `/legal/shipping-returns` on your site
  and fix anything that isn't true for you. Ideally have someone with legal knowledge look them over.
- **Photos:** when you have real product photos, give them to Claude to replace the drawings.

---

## Phase 8: Custom domain (optional, once the name is final)

A domain looks more trustworthy, lets alert emails come from your own address, and is the fallback if
Phase 6 didn't work on workers.dev. **Wait until the name is settled.** A domain is easy to buy and
annoying to change.

### 8.1 Buy the domain through Cloudflare

1. Cloudflare dashboard → **Domain Registration** → **Register Domains**.
2. Search for your name (a `.com` if you can). Cloudflare sells at cost (a `.com` is usually about
   $10–11/year).
3. Buy it (you enter the payment details yourself). WHOIS privacy is included.

### 8.2 Point the domain at the store

1. **Workers & Pages** → `charcoal-bags` → **Settings** → **Domains & Routes** → **Add** →
   **Custom domain** → enter `yourdomain.com` → **Add domain**. Repeat for `www.yourdomain.com` if you
   want both.
2. Wait a few minutes and open `https://yourdomain.com`.

### 8.3 Update everything that knows the old address

| Where                              | Change                                                                        |
| ---------------------------------- | ----------------------------------------------------------------------------- |
| `wrangler.jsonc → PUBLIC_SITE_URL` | `https://yourdomain.com`, then `npm run deploy`                               |
| Turnstile widget → Settings        | **Add hostname** `yourdomain.com` (keep the old one until you're done)        |
| Stripe webhook destination         | Edit the endpoint URL to `https://yourdomain.com/api/stripe/webhook`          |
| Zero Trust `Store admin` app       | Change both destinations to `yourdomain.com` with paths `admin` and `admin/*` |

Then repeat the checks from Phases 5 and 6 on the new address.

### 8.4 Send alerts from your own domain (optional)

1. Resend → **Domains** → **Add domain** → `yourdomain.com`.
2. Resend shows DNS records to add. Because your domain is on Cloudflare, use the button to add them
   automatically if offered. Otherwise add each record yourself in Cloudflare → your domain → **DNS**.
3. Wait for **Verified**.
4. Ask Claude to set `EMAIL_FROM` to `Your Brand <orders@yourdomain.com>`. Alerts can now go to any
   address.

### 8.5 Turn off the workers.dev address (recommended)

Once everything works on the domain: **Workers & Pages** → `charcoal-bags` → **Settings** →
**Domains & Routes** → **workers.dev** → **Disable**. Now there's only one address to protect.

---

## Phase 9: Go live with real payments (45 min)

**Only start this when** Phases 5–7 pass, the placeholders are real, and you're ready to ship by the
date you set.

### 9.1 Activate Stripe

1. In Stripe, switch to **live mode** (leave the sandbox) and click **Activate payments** (or
   "Complete your profile").
2. **Business type:** **Individual / Sole proprietorship**. You file the LLC once you reach $500 net
   profit (the admin dashboard tracks this); you'll update these details in Stripe then.
3. Fill in, **yourself**, directly in Stripe: legal name, date of birth, home address, phone, and Social
   Security number (Stripe is legally required to verify you). Never put these in a chat.
4. **Industry:** retail of home goods (or the closest match). **Website:** your store URL. **Product
   description:** e.g. "Handmade canvas bags filled with activated bamboo charcoal that absorb odors in
   shoes and gym bags. Shipped within the US."
5. **Statement descriptor** (what shows on card statements, 5–22 characters): e.g. `BLACKBAG ODOR`.
6. **Payout bank account:** a US checking account in your name.
7. Submit. Stripe may ask for more documents; watch your email.

### 9.2 Account settings (live mode)

- **Settings → Business → Public details:** business name, support email, support phone (optional).
- **Settings → Branding:** upload a square logo, and set the brand color to `#c8a97e` and the accent to
  `#111111`. This styles the checkout page.
- **Settings → Customer emails:** turn on **Successful payments** and **Refunds**. These are the
  customer's receipts.

### 9.3 Switch the keys to live

1. Live mode → **Developers → API keys** → **Secret key** (`sk_live_…`) → run:

   ```bash
   npx wrangler secret put STRIPE_SECRET_KEY
   ```

2. Live mode → **Developers → Webhooks** → **Add destination**: same five events, same endpoint URL as
   Phase 4 → create → copy the new **signing secret** (`whsec_…`) → run:

   ```bash
   npx wrangler secret put STRIPE_WEBHOOK_SECRET
   ```

Both secrets now come from live mode. The site switches immediately, no redeploy needed.

### 9.4 One real order, then refund it

1. Buy one Single on your own site with your real card.
2. Check that it shows **paid** in `/admin/orders` and that the alert arrived.
3. Open the order in the admin → **Refund**. Check that Stripe shows the refund and the order shows
   **refunded**. Stripe keeps its fee (about 56¢) even on a refund. That's the cost of the test.

**You're live.** Day-to-day operations (fulfilling orders, refunds, batches) are in
[operations.md](operations.md).

---

## Phase 10: Auto-deploy from GitHub (optional)

Until now you deploy with `npm run deploy` from your Mac, which is fine. If you'd rather have every
push to `main` deploy automatically:

1. **Workers & Pages** → `charcoal-bags` → **Settings** → **Builds** → **Connect** → GitHub →
   authorize → pick `Nick-148/charcoal_bags`.
2. **Build command:** `npm ci && npm run build` · **Deploy command:** `npx wrangler deploy`
3. **Build variables:** `PUBLIC_SITE_URL` = your site URL.
4. **Production branch:** `main`.

GitHub Actions already runs all tests on every push. Only merge to `main` when it's green.

---

## Troubleshooting

Watch the live logs while you reproduce a problem:

```bash
npx wrangler tail
```

| Symptom (exact text you'll see)                                 | Likely cause and fix                                                                                                                                                                                                                                                                                                            |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Checkout is temporarily offline"                               | `STRIPE_SECRET_KEY` or `STRIPE_WEBHOOK_SECRET` is missing. Re-run both `secret put` commands.                                                                                                                                                                                                                                   |
| Paid on Stripe, but the order stays **pending** in the admin    | Webhook problem. In Stripe → Webhooks → your destination → Event deliveries, a **400** means the signing secret is wrong or from the other mode (copy it again and `secret put` it); a **404** means the URL is wrong. The site also re-checks Stripe every 15 minutes, so stuck orders fix themselves within about 45 minutes. |
| Contact form: "We could not verify you are human"               | The Turnstile widget's hostname doesn't exactly match the site's address, or `TURNSTILE_SITE_KEY` belongs to a different widget than the secret.                                                                                                                                                                                |
| No alert emails                                                 | `ALERT_EMAIL_TO` must be your Resend sign-up email until you verify a domain. Check spam, and Resend → **Emails/Logs** for errors.                                                                                                                                                                                              |
| `/admin`: "Admin is not configured yet" (503)                   | `ACCESS_TEAM_DOMAIN` or `ACCESS_AUD` is empty or not a valid URL. Fix it in `wrangler.jsonc` and redeploy.                                                                                                                                                                                                                      |
| `/admin`: "Not authorized." with no Cloudflare login page first | The Access application doesn't cover that path. Check that it has both `admin` and `admin/*`.                                                                                                                                                                                                                                   |
| `/admin`: "Not authorized." after logging in                    | Your email isn't in `ADMIN_EMAILS`, or `ACCESS_AUD` was copied from a different Access application.                                                                                                                                                                                                                             |
| Not sure what's missing                                         | Log in to `/admin`: the banner at the top lists every setting that's missing or still in test mode.                                                                                                                                                                                                                             |
| Something broke after a deploy                                  | Workers & Pages → `charcoal-bags` → **Deployments** → **Rollback** to the previous version (instant).                                                                                                                                                                                                                           |

When stuck, tell Claude what you see (the exact error text, or the output of `npx wrangler tail`).
Never include secret keys.
