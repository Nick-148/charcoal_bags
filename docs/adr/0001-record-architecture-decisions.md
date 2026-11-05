# 0001. Record architecture decisions

- **Status:** Accepted
- **Date:** 2026-11-04
- **Decided by:** founder (brief requires `docs/adr/`)

## Context

The project is built largely by AI agents working autonomously in short sessions for a founder with
~10 hrs/week. Decisions made without asking must be visible and reversible.

## Decision

Keep lightweight ADRs in `docs/adr/` using `template.md`. Every default chosen without the founder's
input is recorded with "Decided by: agent".

## Consequences

Future sessions can reconstruct _why_ quickly. ADRs are append-only; superseding requires a new ADR.
