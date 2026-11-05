import type { APIContext } from 'astro';
import { describe, expect, it } from 'vitest';
import { GET as robots } from '@/pages/robots.txt.ts';
import { readSiteUrl, resolveSiteUrl } from '../../scripts/site-url.mjs';

const wrangler = (siteUrl: string) => `{
  // Comments and trailing commas are valid JSONC.
  "name": "charcoal-bags",
  "vars": {
    "ENVIRONMENT": "production",
    "PUBLIC_SITE_URL": "${siteUrl}",
  },
}`;

describe('resolveSiteUrl', () => {
  it('reads the Worker URL from wrangler.jsonc when the environment has none', () => {
    expect(resolveSiteUrl(undefined, wrangler('https://shop.example'))).toBe('https://shop.example');
    expect(resolveSiteUrl('', wrangler('https://shop.example'))).toBe('https://shop.example');
  });

  it('lets an explicit environment variable override the config', () => {
    expect(resolveSiteUrl('https://staging.example', wrangler('https://shop.example'))).toBe(
      'https://staging.example',
    );
  });

  it('normalises to the origin', () => {
    expect(resolveSiteUrl(undefined, wrangler(' https://shop.example/some/path/ '))).toBe(
      'https://shop.example',
    );
  });

  it('returns undefined rather than guessing when no URL is configured', () => {
    expect(resolveSiteUrl(undefined, wrangler(''))).toBeUndefined();
    expect(resolveSiteUrl(undefined, '{ "name": "charcoal-bags" }')).toBeUndefined();
  });

  it('fails the build on a malformed URL or config', () => {
    expect(() => resolveSiteUrl(undefined, wrangler('charcoal-bags.workers.dev'))).toThrow(/not a valid URL/);
    expect(() => resolveSiteUrl('ftp://shop.example', '{}')).toThrow(/https/);
    expect(() => resolveSiteUrl(undefined, '{ "vars": { ')).toThrow(/could not be parsed/);
  });

  it('parses the real wrangler.jsonc', () => {
    expect(() => readSiteUrl()).not.toThrow();
  });
});

describe('robots.txt', () => {
  const render = async (site: URL | undefined) => (await robots({ site } as unknown as APIContext)).text();

  it('points crawlers at the absolute sitemap URL', async () => {
    expect(await render(new URL('https://shop.example'))).toContain(
      'Sitemap: https://shop.example/sitemap-index.xml',
    );
  });

  it('omits the sitemap when the site URL is unknown (no sitemap is generated)', async () => {
    const body = await render(undefined);
    expect(body).not.toContain('Sitemap');
    expect(body).toContain('Disallow: /admin');
  });
});
