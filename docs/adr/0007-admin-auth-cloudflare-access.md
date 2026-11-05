# 0007. Admin auth: Cloudflare Access + in-Worker JWT verification

- **Status:** Accepted
- **Date:** 2026-11-04
- **Decided by:** founder (Access), agent (defense in depth)

## Context

The brief requires a private admin protected by Cloudflare Access. Edge-only protection is a single
point of failure (a misconfigured Access app would expose the admin). On `*.workers.dev`, path-scoped
Access applications are not clearly supported.

## Decision

- `/admin/*` and `/api/admin/*` require a valid `Cf-Access-Jwt-Assertion` (RS256, issuer = team
  domain, audience = the Access app's AUD tag) verified in `src/middleware.ts` with `jose` and the
  team's JWKS. Missing/invalid → 401/403. Missing config → 503. **Fails closed.**
- Optional `ADMIN_EMAILS` allowlist is checked after Access.
- Local development uses `ADMIN_AUTH_MODE=dev-bypass`, honored only when `ENVIRONMENT=development`
  **and** the request host is localhost.
- Admin mutations are HTML form POSTs protected by Astro's `checkOrigin` CSRF check and recorded in
  `admin_audit_log` with the Access email.

## Consequences

- If Access can't scope `/admin` on workers.dev, the admin stays locked (503/401) until either the
  path-scoped app works or a custom domain is added (recommended anyway). See `docs/runbooks/deploy.md`.
