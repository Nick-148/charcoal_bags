// @ts-check
import { readFileSync } from 'node:fs';
import { parse, printParseErrorCode } from 'jsonc-parser';

/**
 * The canonical site URL baked into the build (canonical tags, sitemap, robots.txt).
 *
 * An explicit PUBLIC_SITE_URL environment variable wins (Workers Builds, CI). Otherwise the build uses
 * the same value the Worker runs with, from `wrangler.jsonc → vars`, so a local `npm run deploy` can't
 * ship pages that disagree with production. Empty means "not known yet" and yields undefined: we never
 * guess a host. A malformed value fails the build instead of shipping broken canonical links.
 *
 * @param {string | undefined} envValue
 * @param {string} wranglerText contents of wrangler.jsonc
 * @returns {string | undefined} the URL's origin, e.g. "https://shop.example"
 */
export function resolveSiteUrl(envValue, wranglerText) {
  const raw = envValue || readConfiguredSiteUrl(wranglerText);
  if (!raw) return undefined;
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`PUBLIC_SITE_URL is not a valid URL: "${raw}"`);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`PUBLIC_SITE_URL must start with https:// (got "${raw}")`);
  }
  return url.origin;
}

/**
 * @param {string} wranglerText
 * @returns {string}
 */
function readConfiguredSiteUrl(wranglerText) {
  /** @type {import('jsonc-parser').ParseError[]} */
  const errors = [];
  const config = parse(wranglerText, errors, { allowTrailingComma: true });
  if (errors.length > 0) {
    const first = errors[0];
    throw new Error(
      `wrangler.jsonc could not be parsed (${first ? printParseErrorCode(first.error) : 'unknown error'}).`,
    );
  }
  const value = config?.vars?.PUBLIC_SITE_URL;
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * @param {URL} [wranglerPath]
 * @returns {string | undefined}
 */
export function readSiteUrl(wranglerPath = new URL('../wrangler.jsonc', import.meta.url)) {
  return resolveSiteUrl(process.env.PUBLIC_SITE_URL, readFileSync(wranglerPath, 'utf8'));
}
