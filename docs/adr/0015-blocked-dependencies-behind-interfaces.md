# 0015. Blocked dependencies go behind interfaces

- **Status:** Accepted
- **Date:** 2026-11-04
- **Decided by:** founder (brief rule)

## Decision

When work depends on something unavailable (an account, a key, a decision, an asset):

1. Document the blocker in `PLAN.md → Blockers`.
2. Define a port (interface) and ship a fake/console adapter selected by config.
3. Refuse unsafe fakes in production via `parseConfig`, and surface the gap in the admin warning banner.
4. Continue with unblocked work.

Applied to: payments (`fake`), email (`console`), captcha (`disabled`), admin auth (`dev-bypass`),
product photos (SVG art), contact details (placeholders in `site.ts`).

## Consequences

The whole store runs locally with zero accounts. Production capability gaps degrade per feature (e.g.
checkout 503) rather than taking the site down.
