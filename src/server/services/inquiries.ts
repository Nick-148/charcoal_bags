/**
 * Contact + bulk-quote submissions: rate limit → honeypot → captcha → validate → store → alert.
 */
import type { EmailSender } from '@/server/email';
import { newInquiryAlert } from '@/server/email/templates';
import { newId } from '@/server/ids';
import type { Logger } from '@/server/logger';
import type { CaptchaVerifier } from '@/server/captcha';
import type { RateLimiter } from '@/server/ratelimit';
import {
  bulkInquirySchema,
  contactInquirySchema,
  fieldErrors,
  formStrings,
  type BulkInquiry,
  type ContactInquiry,
} from '@/server/validation';

export interface InquiryDeps {
  db: D1Database;
  email: EmailSender;
  captcha: CaptchaVerifier;
  rateLimiter: RateLimiter;
  logger: Logger;
  alertEmailTo: readonly string[];
  origin: string;
}

export const HONEYPOT_FIELD = 'website';

export const contactFields = ['name', 'email', 'topic', 'message'] as const;
export const bulkFields = [
  'name',
  'email',
  'organization',
  'quantity',
  'neededBy',
  'customization',
  'message',
] as const;

export type InquiryResult =
  | { ok: true; id: string | null }
  | {
      ok: false;
      status: 400 | 403 | 429;
      formError?: string;
      fieldErrors: Record<string, string>;
      values: Record<string, string>;
    };

export async function submitInquiry(
  deps: InquiryDeps,
  kind: 'contact' | 'bulk',
  form: FormData,
  clientIp: string | null,
): Promise<InquiryResult> {
  const fields = kind === 'contact' ? contactFields : bulkFields;
  const values = formStrings(form, fields);

  if (!(await deps.rateLimiter.allow(`inquiry:${clientIp ?? 'unknown'}`))) {
    return {
      ok: false,
      status: 429,
      formError: 'Too many messages from your network. Wait a minute and try again.',
      fieldErrors: {},
      values,
    };
  }

  // Bots fill every field. Pretend success so they learn nothing.
  const honeypot = form.get(HONEYPOT_FIELD);
  if (typeof honeypot === 'string' && honeypot.trim() !== '') {
    deps.logger.info('inquiry.honeypot', { kind });
    return { ok: true, id: null };
  }

  const token = form.get('cf-turnstile-response');
  const action = kind === 'contact' ? 'contact' : 'bulk_quote';
  if (!(await deps.captcha.verify(typeof token === 'string' ? token : null, clientIp, action))) {
    return {
      ok: false,
      status: 403,
      formError: 'We could not verify you are human. Refresh the page and try again.',
      fieldErrors: {},
      values,
    };
  }

  const parsed =
    kind === 'contact' ? contactInquirySchema.safeParse(values) : bulkInquirySchema.safeParse(values);
  if (!parsed.success) return { ok: false, status: 400, fieldErrors: fieldErrors(parsed.error), values };

  const id = newId();
  const data = parsed.data as ContactInquiry | BulkInquiry;
  const bulk = kind === 'bulk' ? (data as BulkInquiry) : null;
  const contact = kind === 'contact' ? (data as ContactInquiry) : null;

  await deps.db
    .prepare(
      `INSERT INTO inquiries (id, kind, name, email, topic, organization, quantity, needed_by, customization, message)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      kind,
      data.name,
      data.email.toLowerCase(),
      contact?.topic ?? null,
      bulk?.organization ?? null,
      bulk?.quantity ?? null,
      bulk?.neededBy ?? null,
      bulk?.customization || null,
      data.message,
    )
    .run();
  deps.logger.info('inquiry.created', { kind, inquiryId: id });

  if (deps.alertEmailTo.length > 0) {
    const alert = newInquiryAlert({
      kind,
      name: data.name,
      email: data.email,
      topic: contact?.topic ?? null,
      organization: bulk?.organization ?? null,
      quantity: bulk?.quantity ?? null,
      neededBy: bulk?.neededBy ?? null,
      customization: bulk?.customization || null,
      message: data.message,
      adminUrl: `${deps.origin}/admin/inquiries/${id}`,
    });
    try {
      await deps.email.send({
        to: [...deps.alertEmailTo],
        replyTo: data.email,
        idempotencyKey: `inquiry-${id}`,
        ...alert,
      });
    } catch (error) {
      deps.logger.error('inquiry.alert_failed', error, { inquiryId: id });
    }
  }
  return { ok: true, id };
}
