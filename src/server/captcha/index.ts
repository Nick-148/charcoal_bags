/**
 * Bot protection port (Cloudflare Turnstile). See docs/adr/0009-turnstile-and-rate-limits.md.
 */

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

  constructor(
    private readonly secretKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async verify(token: string | null, remoteIp: string | null, expectedAction?: string): Promise<boolean> {
    // Turnstile tokens are at most 2048 characters.
    if (!token || token.length > 2048) return false;
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
      if (!response.ok) return false;
      const result = (await response.json()) as SiteverifyResponse;
      if (result.success !== true) return false;
      // Cloudflare's test keys return no action; real widgets always echo data-action.
      return !expectedAction || result.action === undefined || result.action === expectedAction;
    } catch {
      // Fail closed: if we cannot verify, treat it as a bot. The user can retry.
      return false;
    }
  }
}
