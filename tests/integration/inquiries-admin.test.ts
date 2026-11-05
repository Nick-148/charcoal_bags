import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DisabledCaptchaVerifier, type CaptchaVerifier } from '@/server/captcha';
import { getInquiry, getInventoryMap } from '@/server/db/queries';
import { MemoryEmailSender } from '@/server/email';
import { createMemoryLogger } from '@/server/logger';
import { createCountingLimiter } from '@/server/ratelimit';
import {
  getDashboardStats,
  updateFulfillment,
  updateInquiry,
  updateInventory,
} from '@/server/services/admin';
import { HONEYPOT_FIELD, submitInquiry, type InquiryDeps } from '@/server/services/inquiries';
import { createTestDb, resetDb } from './db';

let db: D1Database;
let dispose: () => Promise<void>;
let deps: InquiryDeps & { email: MemoryEmailSender };

beforeAll(async () => {
  ({ db, dispose } = await createTestDb());
});
afterAll(async () => dispose());

beforeEach(async () => {
  await resetDb(db);
  deps = {
    db,
    email: new MemoryEmailSender(),
    captcha: new DisabledCaptchaVerifier(),
    rateLimiter: createCountingLimiter(3),
    logger: createMemoryLogger(),
    alertEmailTo: ['founder@example.com'],
    origin: 'https://shop.test',
  };
});

function form(fields: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

const contact = {
  name: 'Ann',
  email: 'Ann@Example.com',
  topic: 'Order question',
  message: 'Where is my order at?',
};
const bulk = {
  name: 'Coach K',
  email: 'coach@example.com',
  organization: 'Wildcats Lacrosse',
  quantity: '40',
  neededBy: '2027-03-01',
  customization: 'Navy + gold',
  message: 'Need 40 for the spring season.',
};

describe('submitInquiry', () => {
  it('stores a contact message and emails an alert with reply-to', async () => {
    const result = await submitInquiry(deps, 'contact', form(contact), '1.2.3.4');
    expect(result.ok).toBe(true);
    const row = await getInquiry(db, (result as { id: string }).id);
    expect(row).toMatchObject({
      kind: 'contact',
      status: 'new',
      email: 'ann@example.com',
      topic: 'Order question',
    });
    expect(deps.email.sent[0]).toMatchObject({ replyTo: 'Ann@Example.com', to: ['founder@example.com'] });
  });

  it('stores a bulk request with typed fields', async () => {
    const result = await submitInquiry(deps, 'bulk', form(bulk), null);
    const row = await getInquiry(db, (result as { id: string }).id);
    expect(row).toMatchObject({
      kind: 'bulk',
      quantity: 40,
      needed_by: '2027-03-01',
      organization: 'Wildcats Lacrosse',
    });
    expect(deps.email.sent[0]?.subject).toContain('40 bags');
  });

  it('returns field errors and echoes values', async () => {
    const result = await submitInquiry(deps, 'bulk', form({ ...bulk, quantity: '3', email: 'nope' }), null);
    expect(result).toMatchObject({ ok: false, status: 400, values: { organization: 'Wildcats Lacrosse' } });
    expect(Object.keys((result as { fieldErrors: object }).fieldErrors).sort()).toEqual([
      'email',
      'quantity',
    ]);
  });

  it('silently drops honeypot submissions', async () => {
    const result = await submitInquiry(
      deps,
      'contact',
      form({ ...contact, [HONEYPOT_FIELD]: 'http://spam' }),
      null,
    );
    expect(result).toEqual({ ok: true, id: null });
    expect((await db.prepare('SELECT COUNT(*) AS n FROM inquiries').first<{ n: number }>())?.n).toBe(0);
  });

  it('rejects failed captcha and rate-limited clients', async () => {
    const failing: CaptchaVerifier = { name: 'turnstile', verify: async () => false };
    expect(await submitInquiry({ ...deps, captcha: failing }, 'contact', form(contact), null)).toMatchObject({
      ok: false,
      status: 403,
    });
    for (let i = 0; i < 3; i++) await submitInquiry(deps, 'contact', form(contact), '9.9.9.9');
    expect(await submitInquiry(deps, 'contact', form(contact), '9.9.9.9')).toMatchObject({
      ok: false,
      status: 429,
    });
  });
});

describe('admin services', () => {
  it('updates inventory with validation and an audit trail', async () => {
    expect(
      await updateInventory(
        db,
        { sku: 'SGL-BLK', mode: 'in_stock', available: '12', shipsBy: '', active: true },
        'f@x.co',
      ),
    ).toMatchObject({ ok: true });
    expect((await getInventoryMap(db, ['SGL-BLK'])).get('SGL-BLK')).toMatchObject({
      mode: 'in_stock',
      available: 12,
      ships_by: null,
    });
    expect(
      await updateInventory(
        db,
        { sku: 'SGL-BLK', mode: 'preorder', available: '5', shipsBy: '', active: true },
        'f@x.co',
      ),
    ).toMatchObject({ ok: false });
    expect(
      await updateInventory(
        db,
        { sku: 'NOPE-1', mode: 'in_stock', available: '1', shipsBy: '', active: true },
        'f@x.co',
      ),
    ).toMatchObject({ ok: false });
    const audit = await db
      .prepare("SELECT COUNT(*) AS n FROM admin_audit_log WHERE entity_type = 'inventory'")
      .first<{ n: number }>();
    expect(audit?.n).toBe(1);
  });

  it('guards fulfilment transitions', async () => {
    await db
      .prepare(
        `INSERT INTO orders (id, number, payment_status, bag_count, list_subtotal_cents, subtotal_cents, shipping_cents, total_cents)
         VALUES ('o1', 'BB-AAAAAA', 'pending', 1, 900, 900, 400, 1300), ('o2', 'BB-BBBBBB', 'paid', 1, 900, 900, 400, 1300)`,
      )
      .run();
    const ship = { fulfillmentStatus: 'shipped', carrier: 'USPS', trackingNumber: '', adminNotes: '' };
    expect(await updateFulfillment(db, 'o1', ship, 'f')).toMatchObject({ ok: false });
    expect(await updateFulfillment(db, 'o2', ship, 'f')).toMatchObject({
      ok: false,
      fieldErrors: { trackingNumber: expect.any(String) },
    });
    expect(
      await updateFulfillment(db, 'o2', { ...ship, trackingNumber: '9400 1000 0000' }, 'f'),
    ).toMatchObject({ ok: true });
    const order = await db
      .prepare("SELECT fulfillment_status, shipped_at FROM orders WHERE id = 'o2'")
      .first<{ fulfillment_status: string; shipped_at: string | null }>();
    expect(order?.fulfillment_status).toBe('shipped');
    expect(order?.shipped_at).not.toBeNull();
    expect(await updateFulfillment(db, 'o2', { ...ship, trackingNumber: '<script>' }, 'f')).toMatchObject({
      ok: false,
    });
    // Paid orders can only be cancelled through a refund, so the customer gets their money back.
    expect(await updateFulfillment(db, 'o2', { ...ship, fulfillmentStatus: 'canceled' }, 'f')).toMatchObject({
      ok: false,
    });
    expect(await updateFulfillment(db, 'o1', { ...ship, fulfillmentStatus: 'canceled' }, 'f')).toMatchObject({
      ok: true,
    });
  });

  it('updates inquiry status', async () => {
    const { id } = (await submitInquiry(deps, 'contact', form(contact), null)) as { id: string };
    expect(
      await updateInquiry(db, id, { status: 'replied', adminNotes: 'Sent tracking' }, 'f'),
    ).toMatchObject({ ok: true });
    expect(await getInquiry(db, id)).toMatchObject({ status: 'replied', admin_notes: 'Sent tracking' });
    expect(await updateInquiry(db, id, { status: 'bogus', adminNotes: '' }, 'f')).toMatchObject({
      ok: false,
    });
  });

  it('computes dashboard stats', async () => {
    await db
      .prepare(
        `INSERT INTO orders (id, number, payment_status, bag_count, list_subtotal_cents, subtotal_cents, shipping_cents, total_cents, amount_paid_cents, paid_at)
         VALUES ('o3', 'BB-CCCCCC', 'paid', 12, 10800, 9000, 0, 9000, 9000, ?)`,
      )
      .bind(new Date().toISOString())
      .run();
    const stats = await getDashboardStats(db);
    expect(stats).toMatchObject({
      paidOrders: 1,
      revenueCents: 9000,
      bagsSold: 12,
      toFulfill: 1,
      monthRevenueCents: 9000,
    });
    // 9000 − 12×150 − (261 + 30) − 450
    expect(stats.estimatedNetProfitCents).toBe(9000 - 1800 - 291 - 450);
  });
});
