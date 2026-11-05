/**
 * Email port. Console adapter in development (and as a logged fallback when Resend is not configured);
 * Resend in production. See docs/adr/0008-email-behind-interface.md.
 */
import type { Logger } from '@/server/logger';

export interface EmailMessage {
  to: string[];
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
  /** Prevents duplicate sends when a webhook is retried. */
  idempotencyKey?: string;
}

export interface EmailSender {
  readonly name: 'resend' | 'console' | 'memory';
  send(message: EmailMessage): Promise<void>;
}

export class EmailDeliveryError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'EmailDeliveryError';
  }
}

export class ConsoleEmailSender implements EmailSender {
  readonly name = 'console' as const;
  constructor(
    private readonly logger: Logger,
    private readonly from: string,
  ) {}

  async send(message: EmailMessage): Promise<void> {
    // Development convenience only: the body may contain PII, so production never uses this path
    // for anything but the subject line (see createEmailSender).
    this.logger.info('email.console', {
      from: this.from,
      recipients: message.to.length,
      subject: message.subject,
      text: message.text,
    });
  }
}

/** Logs only the subject — used in production when Resend is not configured. */
export class RedactedLogEmailSender implements EmailSender {
  readonly name = 'console' as const;
  constructor(private readonly logger: Logger) {}

  async send(message: EmailMessage): Promise<void> {
    this.logger.warn('email.not_sent_unconfigured', {
      recipients: message.to.length,
      subject: message.subject,
    });
  }
}

export class MemoryEmailSender implements EmailSender {
  readonly name = 'memory' as const;
  readonly sent: EmailMessage[] = [];
  async send(message: EmailMessage): Promise<void> {
    this.sent.push(message);
  }
}

export class ResendEmailSender implements EmailSender {
  readonly name = 'resend' as const;
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async send(message: EmailMessage): Promise<void> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };
    if (message.idempotencyKey) headers['Idempotency-Key'] = message.idempotencyKey;

    let response: Response;
    try {
      response = await this.fetchImpl('https://api.resend.com/emails', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          from: this.from,
          to: message.to,
          subject: message.subject,
          text: message.text,
          html: message.html,
          ...(message.replyTo ? { reply_to: message.replyTo } : {}),
        }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      throw new EmailDeliveryError('Resend request failed.', { cause: error });
    }
    if (!response.ok) {
      const detail = (await response.text().catch(() => '')).slice(0, 300);
      throw new EmailDeliveryError(`Resend responded ${response.status}: ${detail}`);
    }
  }
}
