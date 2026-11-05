# 0011. Launch on *.workers.dev

- **Status:** Accepted (amends the brief's *.pages.dev, see ADR 0002)
- **Date:** 2026-11-04
- **Decided by:** founder

## Decision

Launch on `charcoal-bags.<account>.workers.dev`. Set `PUBLIC_SITE_URL` to it so redirects and email
links never derive from the request host in production.

## Consequences

Add a custom domain before scaling marketing: better trust, a verified email domain for customer
emails, and straightforward path-scoped Cloudflare Access for `/admin`. Domain choice waits on the
final brand name.
