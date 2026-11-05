/**
 * Per-request service container for Astro pages, endpoints, and the cron handler.
 * This is the ONLY module (besides src/worker.ts) that reads the Cloudflare `env` directly.
 */
import { env } from 'cloudflare:workers';
import { allowAll, fromBinding, type RateLimiter } from '@/server/ratelimit';
import { parseConfig, type AppConfig } from '@/server/config';
import { createCaptchaVerifier, createEmailSender, createPaymentGateway } from '@/server/factories';
import { createLogger, type Logger } from '@/server/logger';
import type { OrderServiceDeps } from '@/server/services/orders';
import type { InquiryDeps } from '@/server/services/inquiries';

let cachedConfig: AppConfig | undefined;

/** Env vars are fixed for the life of an isolate, so parse once. */
export function getConfig(): AppConfig {
  cachedConfig ??= parseConfig(env as unknown as Record<string, unknown>);
  return cachedConfig;
}

export function getDb(): D1Database {
  return env.DB;
}

export function rateLimiter(name: 'FORM_RATE_LIMITER' | 'CHECKOUT_RATE_LIMITER'): RateLimiter {
  const binding = (env as unknown as Record<string, RateLimit | undefined>)[name];
  return binding ? fromBinding(binding) : allowAll;
}

/** Client IP as reported by Cloudflare's edge (absent in local dev). */
export function getClientIp(request: Request): string | null {
  return request.headers.get('cf-connecting-ip');
}

/**
 * Public origin for redirect URLs and email links. Production pins it to PUBLIC_SITE_URL (never trust the
 * request host there); locally the request origin is used so any port works.
 */
export function originFor(request: Request, config = getConfig()): string {
  const requestOrigin = new URL(request.url).origin;
  return config.environment === 'production' ? (config.siteUrl ?? requestOrigin) : requestOrigin;
}

export function requestLogger(request: Request): Logger {
  return createLogger({
    requestId: request.headers.get('cf-ray') ?? crypto.randomUUID(),
    path: new URL(request.url).pathname,
  });
}

/** Null when payments are unconfigured — callers must answer 503. */
export function orderDeps(request: Request, logger = requestLogger(request)): OrderServiceDeps | null {
  const config = getConfig();
  const origin = originFor(request, config);
  const payments = createPaymentGateway(config, origin);
  if (!payments) return null;
  return {
    db: getDb(),
    payments,
    email: createEmailSender(config, logger),
    logger,
    alertEmailTo: config.alertEmailTo,
    origin,
  };
}

/** Null when captcha is unconfigured — the form must be shown as unavailable. */
export function inquiryDeps(request: Request, logger = requestLogger(request)): InquiryDeps | null {
  const config = getConfig();
  const captcha = createCaptchaVerifier(config);
  if (!captcha) return null;
  return {
    db: getDb(),
    email: createEmailSender(config, logger),
    captcha,
    rateLimiter: rateLimiter('FORM_RATE_LIMITER'),
    logger,
    alertEmailTo: config.alertEmailTo,
    origin: originFor(request, config),
  };
}

export function turnstileSiteKey(): string | null {
  const config = getConfig();
  return config.captcha.provider === 'turnstile' ? config.captcha.siteKey : null;
}
