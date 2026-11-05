# 0014. No sales tax collection at launch

- **Status:** Accepted
- **Date:** 2026-11-04
- **Decided by:** agent — **founder should confirm with an accountant**

## Context

New Hampshire has no general sales tax. Remote sellers generally owe other states' sales tax only
after crossing economic-nexus thresholds (commonly $100k in sales or 200 transactions per state per year).

## Decision

`tax.collectSalesTax = false`. Totals have a `taxCents` field (always 0) so enabling Stripe Tax later
(`automatic_tax`) is a contained change.

## Consequences

Revisit when any single state approaches its threshold or before wholesale/retail partnerships.
This is not legal or tax advice.
