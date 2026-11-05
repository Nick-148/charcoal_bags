import { describe, expect, it } from 'vitest';
import { parseConfig } from '@/server/config';
import { configWarnings } from '@/server/factories';

const prod = {
  ENVIRONMENT: 'production',
  PUBLIC_SITE_URL: 'https://shop.example.com/some/path',
  PAYMENTS_PROVIDER: 'stripe',
  STRIPE_SECRET_KEY: 'sk_live_x',
  STRIPE_WEBHOOK_SECRET: 'whsec_x',
  EMAIL_PROVIDER: 'resend',
  RESEND_API_KEY: 're_x',
  ALERT_EMAIL_TO: 'a@example.com, not-an-email ,b@example.com',
  CAPTCHA_PROVIDER: 'turnstile',
  TURNSTILE_SITE_KEY: 'site',
  TURNSTILE_SECRET_KEY: 'secret',
  ADMIN_AUTH_MODE: 'access',
  ACCESS_TEAM_DOMAIN: 'https://team.cloudflareaccess.com/',
  ACCESS_AUD: 'aud',
  ADMIN_EMAILS: 'Founder@Example.com',
};

describe('parseConfig', () => {
  it('parses a complete production config', () => {
    const config = parseConfig(prod);
    expect(config.environment).toBe('production');
    expect(config.siteUrl).toBe('https://shop.example.com');
    expect(config.payments.provider).toBe('stripe');
    expect(config.email.provider).toBe('resend');
    expect(config.alertEmailTo).toEqual(['a@example.com', 'b@example.com']);
    expect(config.admin).toEqual({
      mode: 'access',
      teamDomain: 'https://team.cloudflareaccess.com',
      audience: 'aud',
    });
    expect(config.adminEmails).toEqual(['founder@example.com']);
    expect(configWarnings(config)).toEqual([]);
  });

  it('treats unknown ENVIRONMENT values as production', () => {
    expect(parseConfig({ ...prod, ENVIRONMENT: 'dev' }).environment).toBe('production');
  });

  it('refuses development-only providers in production', () => {
    const config = parseConfig({
      ...prod,
      PAYMENTS_PROVIDER: 'fake',
      CAPTCHA_PROVIDER: 'disabled',
      ADMIN_AUTH_MODE: 'dev-bypass',
    });
    expect(config.payments.provider).toBe('unconfigured');
    expect(config.captcha.provider).toBe('unconfigured');
    expect(config.admin.mode).toBe('unconfigured');
  });

  it('allows development-only providers in development', () => {
    const config = parseConfig({
      ...prod,
      ENVIRONMENT: 'development',
      PAYMENTS_PROVIDER: 'fake',
      CAPTCHA_PROVIDER: 'disabled',
      ADMIN_AUTH_MODE: 'dev-bypass',
    });
    expect(config.payments.provider).toBe('fake');
    expect(config.captcha.provider).toBe('disabled');
    expect(config.admin.mode).toBe('dev-bypass');
  });

  it('marks missing secrets as unconfigured instead of throwing', () => {
    const config = parseConfig({ ENVIRONMENT: 'production', STRIPE_SECRET_KEY: '  ' });
    expect(config.payments.provider).toBe('unconfigured');
    expect(config.captcha.provider).toBe('unconfigured');
    expect(config.admin.mode).toBe('unconfigured');
    expect(config.email.provider).toBe('console');
    expect(configWarnings(config).length).toBeGreaterThan(3);
  });

  it('ignores non-string bindings', () => {
    expect(() => parseConfig({ ...prod, DB: {}, FORM_RATE_LIMITER: { limit() {} } })).not.toThrow();
  });
});
