---
name: rebrand
description: Change the brand name, tagline, voice, or visual identity (the current name "Black Bag Odor Co." is provisional). Use when asked to rename the business or change its look.
---

# Rebrand

The brand is isolated on purpose (ADR 0010). Infrastructure names (`charcoal-bags`) don't change.

1. `src/config/site.ts`: name, shortName, orderPrefix (affects only new orders), tagline, hero copy,
   motto, legalName, contact, social, preorderCampaign copy, safetyNote.
2. `src/styles/global.css`: semantic tokens (`--color-surface`, `--color-accent`, …) and font
   families. Install new fonts with `@fontsource/*` packages and import them at the top. No CDN
   fonts (CSP).
3. Copy review for voice: `src/pages/index.astro`, `src/pages/the-vibe.astro`, `src/pages/bulk.astro`,
   `src/content/faq.ts`, `src/config/catalog.ts` descriptions. Mission or tactical words are part of
   the current voice. Rewrite them if the new brand isn't tactical.
4. `public/favicon.svg` and `src/components/Logo.astro` mark (the wordmark renders from config).
5. `wrangler.jsonc → vars.EMAIL_FROM` display name. Stripe dashboard business name and statement descriptor.
6. Docs: `README.md` title, `docs/business/brand.md`, new ADR superseding 0010.
7. `grep -ri "black bag" src docs` should only hit intentional history (ADRs, brand doc).
8. `npm run verify && npm run test:e2e` (E2E checks `BB-` order numbers, so update it if `orderPrefix`
   changes), then review every page at mobile and desktop widths.
