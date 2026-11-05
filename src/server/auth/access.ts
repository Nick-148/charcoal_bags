/**
 * Admin authentication. Cloudflare Access sits in front of /admin at the edge; this module verifies the
 * Access JWT again inside the Worker (defense in depth) and fails closed when anything is missing.
 * See docs/adr/0007-admin-auth-cloudflare-access.md.
 */
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import type { AdminAuthConfig } from '@/server/config';

export interface AdminIdentity {
  email: string;
  source: 'access' | 'dev-bypass';
}

export type AdminAuthResult =
  { ok: true; identity: AdminIdentity } | { ok: false; status: 401 | 403 | 503; reason: string };

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

// Remote JWKS sets cache keys and handle rotation; keep one per team domain per isolate.
const jwksCache = new Map<string, JWTVerifyGetKey>();

function remoteJwks(teamDomain: string): JWTVerifyGetKey {
  let jwks = jwksCache.get(teamDomain);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL('/cdn-cgi/access/certs', teamDomain), {
      timeoutDuration: 5_000,
      cooldownDuration: 30_000,
      cacheMaxAge: 10 * 60_000,
    });
    jwksCache.set(teamDomain, jwks);
  }
  return jwks;
}

export async function verifyAccessToken(
  token: string,
  options: { teamDomain: string; audience: string; getKey?: JWTVerifyGetKey },
): Promise<AdminIdentity> {
  const { payload } = await jwtVerify(token, options.getKey ?? remoteJwks(options.teamDomain), {
    issuer: options.teamDomain,
    audience: options.audience,
    algorithms: ['RS256'],
    clockTolerance: 30,
  });
  const email = payload['email'];
  if (typeof email !== 'string' || email === '') {
    // Service tokens carry no email; they are not valid for the human admin UI.
    throw new Error('Access token has no email claim.');
  }
  return { email: email.toLowerCase(), source: 'access' };
}

export async function authenticateAdmin(
  request: Request,
  config: AdminAuthConfig,
  options: { allowedEmails?: readonly string[]; getKey?: JWTVerifyGetKey } = {},
): Promise<AdminAuthResult> {
  if (config.mode === 'unconfigured') return { ok: false, status: 503, reason: config.reason };

  if (config.mode === 'dev-bypass') {
    // Second guard on top of config: dev-bypass only ever answers requests addressed to localhost.
    if (!LOCAL_HOSTS.has(new URL(request.url).hostname)) {
      return { ok: false, status: 403, reason: 'Dev bypass is only available on localhost.' };
    }
    return { ok: true, identity: { email: config.email, source: 'dev-bypass' } };
  }

  const token = request.headers.get('cf-access-jwt-assertion');
  if (!token) return { ok: false, status: 401, reason: 'Missing Cloudflare Access assertion.' };

  let identity: AdminIdentity;
  try {
    identity = await verifyAccessToken(token, {
      teamDomain: config.teamDomain,
      audience: config.audience,
      ...(options.getKey ? { getKey: options.getKey } : {}),
    });
  } catch {
    return { ok: false, status: 403, reason: 'Invalid Cloudflare Access assertion.' };
  }

  const allowed = options.allowedEmails ?? [];
  if (allowed.length > 0 && !allowed.includes(identity.email)) {
    return { ok: false, status: 403, reason: 'This account is not an admin.' };
  }
  return { ok: true, identity };
}
