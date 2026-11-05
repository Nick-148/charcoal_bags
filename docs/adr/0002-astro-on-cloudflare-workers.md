# 0002. Astro 7 + React islands + Tailwind v4 on Cloudflare Workers

- **Status:** Accepted (supersedes the brief's "Cloudflare Pages")
- **Date:** 2026-11-04
- **Decided by:** both — founder chose Workers when asked

## Context

The brief asked for Cloudflare Pages with "Next.js or Astro/React". The current Astro Cloudflare
adapter (v13+, now v14 for Astro 7) **dropped Cloudflare Pages support**; Cloudflare recommends
Workers (with static assets) for new projects. Next.js on Cloudflare requires OpenNext and also
targets Workers. Options were: Workers (current, supported), static Astro + hand-written Pages
Functions, or pinning Astro 5 (outdated).

## Decision

- **Astro 7** with `output: 'static'`: marketing/legal pages prerender to static HTML; shop, cart,
  checkout, forms and admin opt into on-demand rendering (`export const prerender = false`).
- **React 19 islands** only where interactivity is needed (cart badge, add-to-cart, cart page).
  Admin and forms are server-rendered HTML forms (POST → redirect → GET) — no JS required.
- **Tailwind CSS v4** with semantic theme tokens.
- Deployed as **one Cloudflare Worker** with static assets; custom entry `src/worker.ts` adds a cron
  `scheduled` handler. Deploys from GitHub via Workers Builds.

## Consequences

- Same free tier and edge performance as Pages; gains cron triggers and native rate limiting.
- Launch URL is `*.workers.dev` instead of `*.pages.dev` (see ADR 0011).
- Prerendered pages are served by the asset layer and do not run middleware; their security headers
  come from `public/_headers` (ADR 0016).
