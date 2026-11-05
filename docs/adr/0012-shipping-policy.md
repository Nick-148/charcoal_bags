# 0012. Shipping policy

- **Status:** Accepted
- **Date:** 2026-11-04
- **Decided by:** founder

## Decision

US only. Flat **$4**, free when the merchandise subtotal (after bulk pricing) is **≥ $30**. Values in
`src/config/commerce.ts`; the shipping policy page renders from the same config.

## Consequences

$4 roughly covers a USPS Ground Advantage label for a small mailer (via Pirate Ship). Free shipping
nudges a pair buyer ($18) to add bags. Large bulk orders absorb label cost from margin.
