/**
 * Runs for every on-demand (SSR) request:
 *  1. /admin and /api/admin require a verified admin identity (fail closed).
 *  2. Adds security headers. Prerendered pages and static assets get theirs from public/_headers.
 */
import { defineMiddleware } from 'astro:middleware';

function isAdminPath(pathname: string): boolean {
  return pathname === '/admin' || pathname.startsWith('/admin/') || pathname.startsWith('/api/admin/');
}

export function applySecurityHeaders(
  response: Response,
  { admin, https }: { admin: boolean; https: boolean },
): Response {
  let res = response;
  try {
    res.headers.set('X-Content-Type-Options', 'nosniff');
  } catch {
    // Some responses (e.g. proxied asset fetches) have immutable headers.
    res = new Response(response.body, response);
    res.headers.set('X-Content-Type-Options', 'nosniff');
  }
  const h = res.headers;
  h.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  h.set('X-Frame-Options', 'DENY');
  // The full CSP is emitted by Astro as a <meta> tag with script/style hashes; frame-ancestors only works as a header.
  h.set('Content-Security-Policy', "frame-ancestors 'none'");
  h.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
  );
  h.set('Cross-Origin-Opener-Policy', 'same-origin');
  if (https) h.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  if (admin) {
    h.set('Cache-Control', 'no-store');
    h.set('X-Robots-Tag', 'noindex, nofollow');
  }
  return res;
}

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname, protocol } = context.url;
  const admin = isAdminPath(pathname);
  const https = protocol === 'https:';

  if (admin && !context.isPrerendered) {
    // Imported lazily so prerendering marketing pages never touches runtime bindings.
    const [{ getConfig }, { authenticateAdmin }] = await Promise.all([
      import('@/server/runtime'),
      import('@/server/auth/access'),
    ]);
    const config = getConfig();
    const result = await authenticateAdmin(context.request, config.admin, {
      allowedEmails: config.adminEmails,
    });
    if (!result.ok) {
      console.warn(
        JSON.stringify({ level: 'warn', msg: 'admin.denied', path: pathname, status: result.status }),
      );
      const body =
        result.status === 503
          ? 'Admin is not configured yet. See docs/runbooks/deploy.md.'
          : 'Not authorized.';
      return applySecurityHeaders(
        new Response(body, {
          status: result.status,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        }),
        { admin: true, https },
      );
    }
    context.locals.admin = result.identity;
  }

  return applySecurityHeaders(await next(), { admin, https });
});
