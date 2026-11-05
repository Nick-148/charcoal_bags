import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTPayload } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import { authenticateAdmin } from '@/server/auth/access';
import type { AdminAuthConfig } from '@/server/config';

const TEAM = 'https://team.cloudflareaccess.com';
const AUD = 'app-aud-tag';
const config: AdminAuthConfig = { mode: 'access', teamDomain: TEAM, audience: AUD };

let sign: (claims: JWTPayload, opts?: { iss?: string; aud?: string; exp?: string }) => Promise<string>;
let getKey: ReturnType<typeof createLocalJWKSet>;

beforeAll(async () => {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256' };
  getKey = createLocalJWKSet({ keys: [jwk] });
  sign = (claims, opts = {}) =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setIssuer(opts.iss ?? TEAM)
      .setAudience(opts.aud ?? AUD)
      .setIssuedAt()
      .setExpirationTime(opts.exp ?? '10m')
      .sign(privateKey);
});

const req = (token?: string, host = 'shop.example.com') =>
  new Request(`https://${host}/admin`, { headers: token ? { 'cf-access-jwt-assertion': token } : {} });

describe('authenticateAdmin (Cloudflare Access)', () => {
  it('accepts a valid token and lower-cases the email', async () => {
    const result = await authenticateAdmin(req(await sign({ email: 'Founder@Example.com' })), config, {
      getKey,
    });
    expect(result).toEqual({ ok: true, identity: { email: 'founder@example.com', source: 'access' } });
  });

  it('rejects a missing token with 401', async () => {
    expect(await authenticateAdmin(req(), config, { getKey })).toMatchObject({ ok: false, status: 401 });
  });

  it('rejects wrong audience, wrong issuer, expired, and malformed tokens with 403', async () => {
    for (const token of [
      await sign({ email: 'a@b.co' }, { aud: 'other-app' }),
      await sign({ email: 'a@b.co' }, { iss: 'https://evil.cloudflareaccess.com' }),
      await sign({ email: 'a@b.co' }, { exp: '-5m' }),
      'not-a-jwt',
    ]) {
      expect(await authenticateAdmin(req(token), config, { getKey })).toMatchObject({
        ok: false,
        status: 403,
      });
    }
  });

  it('rejects service tokens (no email claim)', async () => {
    const token = await sign({ common_name: 'svc' });
    expect(await authenticateAdmin(req(token), config, { getKey })).toMatchObject({ ok: false, status: 403 });
  });

  it('enforces the optional email allowlist', async () => {
    const token = await sign({ email: 'intruder@example.com' });
    expect(
      await authenticateAdmin(req(token), config, { getKey, allowedEmails: ['founder@example.com'] }),
    ).toMatchObject({
      ok: false,
      status: 403,
    });
  });

  it('fails closed with 503 when unconfigured', async () => {
    expect(await authenticateAdmin(req(), { mode: 'unconfigured', reason: 'x' })).toMatchObject({
      ok: false,
      status: 503,
    });
  });

  it('only honours dev-bypass on localhost', async () => {
    const bypass: AdminAuthConfig = { mode: 'dev-bypass', email: 'dev@localhost' };
    expect(await authenticateAdmin(req(undefined, 'localhost:4321'), bypass)).toMatchObject({ ok: true });
    expect(await authenticateAdmin(req(undefined, '127.0.0.1:4321'), bypass)).toMatchObject({ ok: true });
    expect(
      await authenticateAdmin(req(undefined, 'charcoal-bags.example.workers.dev'), bypass),
    ).toMatchObject({
      ok: false,
      status: 403,
    });
  });
});
