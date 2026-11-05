import type { APIRoute } from 'astro';

export const GET: APIRoute = ({ site }) => {
  const lines = [
    'User-agent: *',
    'Disallow: /admin',
    'Disallow: /api/',
    'Disallow: /checkout/',
    'Disallow: /cart',
  ];
  // Crawlers require an absolute sitemap URL, and the sitemap is only generated when the site URL is known.
  if (site) lines.push('', `Sitemap: ${new URL('/sitemap-index.xml', site).toString()}`);
  return new Response(`${lines.join('\n')}\n`, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
