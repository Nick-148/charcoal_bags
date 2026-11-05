// @ts-check
import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';
import { readSiteUrl } from './scripts/site-url.mjs';
import { products } from './src/config/catalog';

// Canonical URL for sitemap/robots/canonical tags, baked in at build time from the same PUBLIC_SITE_URL
// the Worker runs with. Unset = no canonical tags (never guess a host).
const site = readSiteUrl();

export default defineConfig({
  ...(site ? { site } : {}),
  // Marketing pages are prerendered; commerce/admin pages opt out with `export const prerender = false`.
  output: 'static',
  adapter: cloudflare({
    // No runtime image transforms: product art is SVG. Build-time optimisation for any raster assets.
    imageService: 'compile',
    // E2E runs use an isolated, throwaway local D1 so they never touch your dev data.
    ...(process.env.E2E_STATE_DIR ? { persistState: { path: process.env.E2E_STATE_DIR } } : {}),
  }),
  // Cart state lives client-side and admin auth is Cloudflare Access, so Astro sessions (KV) are not needed.
  session: false,
  // Shiki emits inline styles that the CSP forbids; we render no code blocks anyway.
  markdown: { syntaxHighlight: false },
  integrations: [
    react(),
    sitemap({
      filter: (page) => !/\/(admin|checkout|cart|api)(\/|$)/.test(new URL(page).pathname),
      // Product pages are rendered on demand (live stock), so the sitemap can't discover them itself.
      customPages: site ? products.map((p) => new URL(`/shop/${p.slug}/`, site).toString()) : [],
    }),
  ],
  security: {
    checkOrigin: true,
    csp: {
      directives: [
        "default-src 'self'",
        "img-src 'self' data:",
        "font-src 'self'",
        "connect-src 'self' https://cloudflareinsights.com",
        'frame-src https://challenges.cloudflare.com',
        "form-action 'self' https://checkout.stripe.com",
        "base-uri 'self'",
        "object-src 'none'",
      ],
      scriptDirective: {
        resources: ["'self'", 'https://challenges.cloudflare.com', 'https://static.cloudflareinsights.com'],
      },
    },
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
