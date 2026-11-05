# 0010. Provisional brand lives in config

- **Status:** Accepted
- **Date:** 2026-11-04
- **Decided by:** founder ("Black Bag Odor Co. for now, might change it")

## Context

Four directions were proposed (Sack the Stink, Funk Toss Co., Black Bag Odor Co., Smell Ya Later).
The founder picked **Black Bag Odor Co.** — "Covert odor ops." — rugged tactical minimalism (stencil
type, matte black, olive drab, kraft), but may rename.

## Decision

- All brand strings in `src/config/site.ts`; visual identity in semantic tokens in
  `src/styles/global.css`; logo wordmark renders from config.
- Infrastructure names (Worker, D1, repo) are brand-neutral (`charcoal-bags`).
- No trademark search has been done — required before printing anything (launch checklist).

## Consequences

A rebrand is a two-file change plus copy review (`.claude/skills/rebrand`). Order-number prefix
(`BB-`) is config too; existing orders keep their numbers.
