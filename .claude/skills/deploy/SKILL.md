---
name: deploy
description: Deploy the storefront to Cloudflare Workers and verify it (migrations, secrets, smoke test, rollback). Use when asked to deploy, release, ship to production, or check a deploy.
---

# Deploy

Normal path: merge to `main` once CI is green, and Workers Builds deploys automatically. Manual path
and first-time setup: `docs/runbooks/deploy.md`.

Checklist for each release:

1. `npm run verify && npm run test:e2e && npm run build` pass locally, and GitHub Actions is green.
2. New migrations? Apply them **before or with** the deploy: `npm run db:migrate:remote`.
3. New env vars or secrets? Add them to `wrangler.jsonc` (`vars`) or `wrangler secret put`, and to
   `.dev.vars.example` and `src/server/config.ts`.
4. Deploy: `npm run deploy` (manual) or merge (automatic).
5. Smoke test production: home loads, a PDP shows availability, `/admin` asks for an Access login,
   and the admin warning banner is empty. Workers → Observability shows no new `level:error`.
6. Log the release in `PROGRESS.md`.

Rollback: Workers → Deployments → Rollback (code). Data: D1 Time Travel (see the runbook). Never run
`wrangler d1 execute --remote` with destructive SQL without an export first.
