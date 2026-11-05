/**
 * Bot protection port (Cloudflare Turnstile). See docs/adr/0009-turnstile-and-rate-limits.md.
 */
import type { Logger } from '@/server/logger';

export interface CaptchaVerifier {
  readonly name: 'turnstile' | 'disabled';
  /** `expectedAction` must match the widget's data-action so tokens can't be replayed across forms. */
  verify(token: string | null, remoteIp: string | null, expectedAction?: string): Promise<boolean>;
}

export class DisabledCaptchaVerifier implements CaptchaVerifier {
  readonly name = 'disabled' as const;
  async verify(): Promise<boolean> {
    return true;
  }
}

interface SiteverifyResponse {
  success: boolean;
  'error-codes'?: string[];
  hostname?: string;
  action?: string;
}

export class TurnstileVerifier implements CaptchaVerifier {
  readonly name = 'turnstile' as const;

  private readonly fetchImpl: typeof fetch;

  constructor(
    private readonly secretKey: string,
    fetchImpl: typeof fetch = fetch,
    private readonly logger: Pick<Logger, 'warn'> | null = null,
  ) {
    // Never call fetch as `this.fetchImpl(...)`: the Workers runtime throws "Illegal invocation".
    this.fetchImpl = (input, init) => fetchImpl(input, init);
  }

  async verify(token: string | null, remoteIp: string | null, expectedAction?: string): Promise<boolean> {
    // A failed check looks identical to the visitor whatever the cause, so record the cause (never the
    // token or secret) to tell "visitor didn't finish the widget" apart from a misconfigured secret.
    const fail = (reason: string, fields: Record<string, unknown> = {}): false => {
      this.logger?.warn('captcha.failed', { reason, action: expectedAction, ...fields });
      return false;
    };
    if (!token) return fail('missing-token');
    // Turnstile tokens are at most 2048 characters.
    if (token.length > 2048) return fail('token-too-long');
    const body = new FormData();
    body.set('secret', this.secretKey);
    body.set('response', token);
    if (remoteIp) body.set('remoteip', remoteIp);
    body.set('idempotency_key', crypto.randomUUID());
    try {
      const response = await this.fetchImpl('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        body,
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) return fail('siteverify-http', { status: response.status });
      const result = (await response.json()) as SiteverifyResponse;
      if (result.success !== true) return fail('rejected', { errorCodes: result['error-codes'] ?? [] });
      // Cloudflare's test keys return no action; real widgets always echo data-action.
      if (expectedAction && result.action !== undefined && result.action !== expectedAction) {
        return fail('action-mismatch', { receivedAction: result.action });
      }
      return true;
    } catch (error) {
      // Fail closed: if we cannot verify, treat it as a bot. The user can retry.
      return fail('siteverify-unreachable', {
        error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      });
    }
  }
}
