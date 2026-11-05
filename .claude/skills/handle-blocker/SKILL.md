---
name: handle-blocker
description: What to do when work is blocked on an external dependency (account, API key, founder decision, asset) — document, stub behind an interface, move on. Use whenever progress depends on something you cannot get right now.
---

# Handling a blocker (ADR 0015)

Never stall. In order:

1. **Document** it in `PLAN.md → Blockers`: id (B#), what's missing, why it blocks, who can unblock
   it, what stub is in place, and the date.
2. **Stub behind an interface:**
   - Define or extend a port in `src/server/<capability>/` (see `PaymentGateway`, `EmailSender`,
     `CaptchaVerifier`).
   - Add a fake or console adapter plus a config switch in `src/server/config.ts`
     (`<CAPABILITY>_PROVIDER`).
   - If the fake would be unsafe in production, make `parseConfig` mark it `unconfigured` when
     `ENVIRONMENT=production`, so the feature degrades (503) rather than lies.
   - Surface it in `configWarnings()` so the admin banner shows the gap.
   - For content (copy, photos, contact info), put a clearly-marked placeholder in config.
3. **Test** the real adapter with mocked `fetch` and the fake through the service tests.
4. **Move on** to the next unblocked item and note the blocker in `PROGRESS.md`.
5. When unblocked: wire the real adapter, remove the PLAN blocker row, and log it.
