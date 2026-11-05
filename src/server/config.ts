/**
 * Runtime configuration parsed from Worker env vars/secrets.
 *
 * Each external capability resolves independently to a configured provider or `unconfigured` with a
 * reason, so a missing Stripe key takes checkout offline (503) without taking the marketing site down.
 * Development-only providers (fake payments, disabled captcha, admin dev-bypass) are refused in
 * production. See docs/adr/0015-blocked-dependencies-behind-interfaces.md.
 */
import { z } from 'zod';

export type Environment = 'development' | 'test' | 'production';

export type PaymentsConfig =
  | { provider: 'stripe'; secretKey: string; webhookSecret: string }
  | { provider: 'fake' }
  | { provider: 'unconfigured'; reason: string };

export type EmailConfig =
  | { provider: 'resend'; apiKey: string; from: string }
  | { provider: 'console'; from: string; reason?: string };

export type CaptchaConfig =
  | { provider: 'turnstile'; siteKey: string; secretKey: string }
  | { provider: 'disabled' }
  | { provider: 'unconfigured'; reason: string };

export type AdminAuthConfig =
  | { mode: 'access'; teamDomain: string; audience: string }
  | { mode: 'dev-bypass'; email: string }
  | { mode: 'unconfigured'; reason: string };

export interface AppConfig {
  environment: Environment;
  /** Canonical public origin, e.g. https://charcoal-bags.example.workers.dev. Null = derive from request. */
  siteUrl: string | null;
  payments: PaymentsConfig;
  email: EmailConfig;
  alertEmailTo: string[];
  captcha: CaptchaConfig;
  admin: AdminAuthConfig;
  /** Optional allowlist checked after Access (defense in depth against a too-broad Access policy). */
  adminEmails: string[];
}

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== '' ? v.trim() : undefined));

const rawSchema = z.object({
  ENVIRONMENT: optionalString,
  PUBLIC_SITE_URL: optionalString,
  PAYMENTS_PROVIDER: optionalString,
  STRIPE_SECRET_KEY: optionalString,
  STRIPE_WEBHOOK_SECRET: optionalString,
  EMAIL_PROVIDER: optionalString,
  EMAIL_FROM: optionalString,
  RESEND_API_KEY: optionalString,
  ALERT_EMAIL_TO: optionalString,
  CAPTCHA_PROVIDER: optionalString,
  TURNSTILE_SITE_KEY: optionalString,
  TURNSTILE_SECRET_KEY: optionalString,
  ADMIN_AUTH_MODE: optionalString,
  ADMIN_DEV_EMAIL: optionalString,
  ADMIN_EMAILS: optionalString,
  ACCESS_TEAM_DOMAIN: optionalString,
  ACCESS_AUD: optionalString,
});

const DEFAULT_FROM = 'Store <onboarding@resend.dev>';

function parseEnvironment(value: string | undefined): Environment {
  // Anything unrecognised is treated as production so a typo can never enable dev-only behaviour.
  if (value === 'development' || value === 'test') return value;
  return 'production';
}

function parseSiteUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.origin;
  } catch {
    return null;
  }
}

function parsePayments(raw: z.infer<typeof rawSchema>, environment: Environment): PaymentsConfig {
  const provider = raw.PAYMENTS_PROVIDER ?? 'stripe';
  if (provider === 'fake') {
    return environment === 'production'
      ? { provider: 'unconfigured', reason: 'The fake payment provider is not allowed in production.' }
      : { provider: 'fake' };
  }
  if (provider !== 'stripe')
    return { provider: 'unconfigured', reason: `Unknown PAYMENTS_PROVIDER "${provider}".` };
  if (!raw.STRIPE_SECRET_KEY || !raw.STRIPE_WEBHOOK_SECRET) {
    return {
      provider: 'unconfigured',
      reason: 'STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET must both be set.',
    };
  }
  if (environment === 'production' && raw.STRIPE_SECRET_KEY.startsWith('sk_test_')) {
    // Allowed (useful for a soft launch on test mode), but loudly visible in logs.
    console.warn(JSON.stringify({ level: 'warn', msg: 'Stripe is in TEST mode in production.' }));
  }
  return { provider: 'stripe', secretKey: raw.STRIPE_SECRET_KEY, webhookSecret: raw.STRIPE_WEBHOOK_SECRET };
}

function parseEmail(raw: z.infer<typeof rawSchema>): EmailConfig {
  const from = raw.EMAIL_FROM ?? DEFAULT_FROM;
  const provider = raw.EMAIL_PROVIDER ?? 'resend';
  if (provider === 'console') return { provider: 'console', from };
  if (provider === 'resend' && raw.RESEND_API_KEY)
    return { provider: 'resend', apiKey: raw.RESEND_API_KEY, from };
  return {
    provider: 'console',
    from,
    reason:
      provider === 'resend'
        ? 'RESEND_API_KEY is not set; emails are logged only.'
        : `Unknown EMAIL_PROVIDER "${provider}".`,
  };
}

function parseCaptcha(raw: z.infer<typeof rawSchema>, environment: Environment): CaptchaConfig {
  const provider = raw.CAPTCHA_PROVIDER ?? 'turnstile';
  if (provider === 'disabled') {
    return environment === 'production'
      ? { provider: 'unconfigured', reason: 'Captcha cannot be disabled in production.' }
      : { provider: 'disabled' };
  }
  if (provider !== 'turnstile')
    return { provider: 'unconfigured', reason: `Unknown CAPTCHA_PROVIDER "${provider}".` };
  if (!raw.TURNSTILE_SITE_KEY || !raw.TURNSTILE_SECRET_KEY) {
    return {
      provider: 'unconfigured',
      reason: 'TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY must both be set.',
    };
  }
  return { provider: 'turnstile', siteKey: raw.TURNSTILE_SITE_KEY, secretKey: raw.TURNSTILE_SECRET_KEY };
}

function parseAdmin(raw: z.infer<typeof rawSchema>, environment: Environment): AdminAuthConfig {
  const mode = raw.ADMIN_AUTH_MODE ?? 'access';
  if (mode === 'dev-bypass') {
    return environment === 'development'
      ? { mode: 'dev-bypass', email: raw.ADMIN_DEV_EMAIL ?? 'dev@localhost' }
      : { mode: 'unconfigured', reason: 'Admin dev-bypass is only allowed when ENVIRONMENT=development.' };
  }
  if (mode !== 'access') return { mode: 'unconfigured', reason: `Unknown ADMIN_AUTH_MODE "${mode}".` };
  const teamDomain = parseSiteUrl(raw.ACCESS_TEAM_DOMAIN);
  if (!teamDomain || !raw.ACCESS_AUD) {
    return { mode: 'unconfigured', reason: 'ACCESS_TEAM_DOMAIN and ACCESS_AUD must both be set.' };
  }
  return { mode: 'access', teamDomain, audience: raw.ACCESS_AUD };
}

function parseEmailList(value: string | undefined): string[] {
  if (!value) return [];
  const email = z.email();
  return value
    .split(',')
    .map((s) => s.trim())
    .filter((s) => email.safeParse(s).success);
}

export function parseConfig(env: Record<string, unknown>): AppConfig {
  const strings = Object.fromEntries(
    Object.entries(env).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  );
  const raw = rawSchema.parse(strings);
  const environment = parseEnvironment(raw.ENVIRONMENT);
  return {
    environment,
    siteUrl: parseSiteUrl(raw.PUBLIC_SITE_URL),
    payments: parsePayments(raw, environment),
    email: parseEmail(raw),
    alertEmailTo: parseEmailList(raw.ALERT_EMAIL_TO),
    captcha: parseCaptcha(raw, environment),
    admin: parseAdmin(raw, environment),
    adminEmails: parseEmailList(raw.ADMIN_EMAILS).map((e) => e.toLowerCase()),
  };
}
