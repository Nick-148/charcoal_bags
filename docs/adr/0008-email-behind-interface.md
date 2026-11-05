# 0008. Email behind an interface (console in dev, Resend in production)

- **Status:** Accepted
- **Date:** 2026-11-04
- **Decided by:** founder (brief), agent (details)

## Decision

`EmailSender` port with `ConsoleEmailSender` (dev, logs body), `RedactedLogEmailSender` (production
fallback when unconfigured — logs subject only, no PII), and `ResendEmailSender` (fetch, 10s timeout,
`Idempotency-Key`). Alerts go to `ALERT_EMAIL_TO` for new paid orders and new inquiries (with
`reply_to` set to the customer). Customer receipts are Stripe's.

## Consequences

- Resend's sandbox sender (`onboarding@resend.dev`) can only deliver to the Resend account owner —
  fine for founder alerts. Customer-facing emails (shipping notifications) need a verified domain → future work.
