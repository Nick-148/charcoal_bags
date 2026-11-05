/** Input schemas for every public and admin write. Anything not matching is rejected with 400. */
import { z } from 'zod';
import { limits } from '@/config/commerce';
import { FULFILLMENT_STATUSES, INQUIRY_STATUSES } from '@/server/db/queries';

const trimmed = (max: number) => z.string().trim().max(max);
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.')
  .refine((v) => !Number.isNaN(new Date(`${v}T00:00:00Z`).getTime()), 'Not a real date.');

export const checkoutRequestSchema = z.object({
  items: z
    .array(
      z.object({
        sku: z.string().regex(/^[A-Z0-9-]{2,24}$/),
        quantity: z.number().int().min(1).max(limits.maxQuantityPerLine),
      }),
    )
    .min(1)
    .max(limits.maxLines),
});

export const contactTopics = [
  'Order question',
  'Wholesale / retail',
  'Press or collab',
  'Something else',
] as const;

export const contactInquirySchema = z.object({
  name: trimmed(100).min(1, 'Tell us your name.'),
  email: z.email('Enter a valid email address.').max(254),
  topic: z.enum(contactTopics, 'Pick a topic.'),
  message: trimmed(4000).min(10, 'Give us at least a sentence (10+ characters).'),
});

export const bulkInquirySchema = z.object({
  name: trimmed(100).min(1, 'Tell us your name.'),
  email: z.email('Enter a valid email address.').max(254),
  organization: trimmed(150).min(1, 'Which team, club, or company is this for?'),
  quantity: z.coerce
    .number('Enter a number of bags.')
    .int('Whole bags only.')
    .min(10, 'Bulk orders start at 10 bags.')
    .max(10_000, 'For more than 10,000 bags, email us directly.'),
  neededBy: z.union([z.literal(''), isoDate]).transform((v) => (v === '' ? null : v)),
  customization: trimmed(1000),
  message: trimmed(4000).min(10, 'Give us at least a sentence (10+ characters).'),
});

export type ContactInquiry = z.infer<typeof contactInquirySchema>;
export type BulkInquiry = z.infer<typeof bulkInquirySchema>;

export const fulfillmentUpdateSchema = z.object({
  fulfillmentStatus: z.enum(FULFILLMENT_STATUSES as [string, ...string[]]),
  carrier: trimmed(40).transform((v) => v || null),
  trackingNumber: z
    .string()
    .trim()
    .max(64)
    .regex(/^[A-Za-z0-9 -]*$/, 'Tracking numbers are letters, digits, spaces, and dashes.')
    .transform((v) => v || null),
  adminNotes: trimmed(2000).transform((v) => v || null),
});

export const inventoryUpdateSchema = z.object({
  sku: z.string().regex(/^[A-Z0-9-]{2,24}$/),
  mode: z.enum(['in_stock', 'preorder']),
  available: z
    .string()
    .trim()
    .transform((v, ctx) => {
      if (v === '') return null;
      const n = Number(v);
      if (!Number.isInteger(n) || n < 0 || n > 100_000) {
        ctx.addIssue({
          code: 'custom',
          message: 'Available must be blank (unlimited) or a whole number ≥ 0.',
        });
        return z.NEVER;
      }
      return n;
    }),
  shipsBy: z.union([z.literal(''), isoDate]).transform((v) => (v === '' ? null : v)),
  active: z.boolean(),
});

export const inquiryUpdateSchema = z.object({
  status: z.enum(INQUIRY_STATUSES as [string, ...string[]]),
  adminNotes: trimmed(2000).transform((v) => v || null),
});

/** Flattens zod issues to { field: firstMessage } for form re-rendering. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? '_form');
    out[key] ??= issue.message;
  }
  return out;
}

/** Reads string fields from FormData (files and missing fields become ''). */
export function formStrings(form: FormData, fields: readonly string[]): Record<string, string> {
  return Object.fromEntries(
    fields.map((f) => {
      const value = form.get(f);
      return [f, typeof value === 'string' ? value : ''];
    }),
  );
}
