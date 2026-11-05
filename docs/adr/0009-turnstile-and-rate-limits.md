# 0009. Turnstile, rate limits, honeypot

- **Status:** Accepted
- **Date:** 2026-11-04
- **Decided by:** founder (Turnstile), agent (layers)

## Decision

Public forms (contact, bulk quote) are protected by, in order: Workers Rate Limiting binding
(5/min/IP), a hidden honeypot field (silently accepted, not stored), Cloudflare Turnstile verified
server-side (fails closed on network error), then zod validation. Checkout creation is rate limited
(10/min/IP); it is not captcha-gated to keep conversion friction low — prices and stock are
server-validated and sessions expire.

## Consequences

Dev uses Cloudflare's published always-pass Turnstile test keys. `CAPTCHA_PROVIDER=disabled` is
refused in production. The rate limiter is per-colo/eventually consistent — abuse mitigation only.
