# 0016. Security headers & Content Security Policy

- **Status:** Accepted
- **Date:** 2026-11-04
- **Decided by:** agent

## Decision

- Astro's built-in CSP (`security.csp`) emits a `<meta>` policy with SHA-256 hashes for every script
  and style it generates. Allowed third parties: `challenges.cloudflare.com` (Turnstile) and
  `static.cloudflareinsights.com` (optional cookieless analytics). Forms may post to Stripe Checkout.
- `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`,
  `COOP` and HSTS are sent as **headers**: from `src/middleware.ts` for SSR and `public/_headers` for
  prerendered pages/assets.
- No inline `style` attributes anywhere (React islands included); progress bars use `<progress>`.
- Astro `checkOrigin` CSRF protection is on for all form POSTs; JSON endpoints require
  `Content-Type: application/json` (forces a CORS preflight cross-origin).

## Consequences

Adding a third-party script/embed requires updating `astro.config.mjs` and an ADR. CSP is not active
under `astro dev`; verify with `npm run build && npm run preview`.
