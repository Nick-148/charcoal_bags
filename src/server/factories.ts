/** Builds adapter instances from parsed config. Pure — no `cloudflare:workers` import — so it is testable. */
import { DisabledCaptchaVerifier, TurnstileVerifier, type CaptchaVerifier } from '@/server/captcha';
import type { AppConfig } from '@/server/config';
import {
  ConsoleEmailSender,
  RedactedLogEmailSender,
  ResendEmailSender,
  type EmailSender,
} from '@/server/email';
import type { Logger } from '@/server/logger';
import { FakePaymentGateway } from '@/server/payments/fake';
import { StripePaymentGateway } from '@/server/payments/stripe';
import type { PaymentGateway } from '@/server/payments/types';

export function createPaymentGateway(config: AppConfig, origin: string): PaymentGateway | null {
  switch (config.payments.provider) {
    case 'stripe':
      return new StripePaymentGateway(config.payments.secretKey, config.payments.webhookSecret);
    case 'fake':
      return new FakePaymentGateway({ origin });
    case 'unconfigured':
      return null;
  }
}

export function createEmailSender(config: AppConfig, logger: Logger): EmailSender {
  if (config.email.provider === 'resend')
    return new ResendEmailSender(config.email.apiKey, config.email.from);
  // Outside development, never write email bodies (customer PII) to logs.
  return config.environment === 'development'
    ? new ConsoleEmailSender(logger, config.email.from)
    : new RedactedLogEmailSender(logger);
}

export function createCaptchaVerifier(config: AppConfig): CaptchaVerifier | null {
  switch (config.captcha.provider) {
    case 'turnstile':
      return new TurnstileVerifier(config.captcha.secretKey);
    case 'disabled':
      return new DisabledCaptchaVerifier();
    case 'unconfigured':
      return null;
  }
}

/** Human-readable list of capabilities that are not production-ready, for the admin banner and logs. */
export function configWarnings(config: AppConfig): string[] {
  const warnings: string[] = [];
  if (config.payments.provider === 'unconfigured')
    warnings.push(`Checkout offline: ${config.payments.reason}`);
  if (config.payments.provider === 'fake') warnings.push('Payments use the local FAKE gateway.');
  if (config.email.provider === 'console') {
    warnings.push(
      `Emails are not being sent${config.email.reason ? `: ${config.email.reason}` : ' (console provider).'}`,
    );
  }
  if (config.alertEmailTo.length === 0)
    warnings.push('ALERT_EMAIL_TO is empty — no order/inquiry alerts will be sent.');
  if (config.captcha.provider === 'unconfigured') warnings.push(`Forms offline: ${config.captcha.reason}`);
  if (config.captcha.provider === 'disabled') warnings.push('Captcha is DISABLED.');
  if (config.admin.mode === 'dev-bypass') warnings.push('Admin auth is in localhost dev-bypass mode.');
  if (!config.siteUrl)
    warnings.push('PUBLIC_SITE_URL is not set — redirect URLs fall back to the request origin.');
  return warnings;
}
