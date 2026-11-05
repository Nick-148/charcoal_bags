import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getInventoryMap, getOrderById, getOrderItems } from '@/server/db/queries';
import { MemoryEmailSender } from '@/server/email';
import { createMemoryLogger } from '@/server/logger';
import { fakeCompletedSession, FakePaymentGateway } from '@/server/payments/fake';
import type { PaymentEvent } from '@/server/payments/types';
import {
  applyCheckoutSession,
  createCheckout,
  handlePaymentEvent,
  reconcileStalePendingOrders,
  refundOrder,
  type OrderServiceDeps,
} from '@/server/services/orders';
import { createTestDb, resetDb } from './db';

let db: D1Database;
let dispose: () => Promise<void>;
let deps: OrderServiceDeps & { payments: FakePaymentGateway; email: MemoryEmailSender };
let clock: Date;

beforeAll(async () => {
  ({ db, dispose } = await createTestDb());
});
afterAll(async () => dispose());

beforeEach(async () => {
  await resetDb(db);
  clock = new Date('2026-11-04T12:00:00Z');
  const now = () => clock;
  deps = {
    db,
    payments: new FakePaymentGateway({ origin: 'https://shop.test', now }),
    email: new MemoryEmailSender(),
    logger: createMemoryLogger(),
    alertEmailTo: ['founder@example.com'],
    origin: 'https://shop.test',
    now,
  };
});

async function available(sku: string) {
  return (await getInventoryMap(db, [sku])).get(sku)?.available;
}

async function checkout(items: { sku: string; quantity: number }[]) {
  const result = await createCheckout(deps, items);
  if (!result.ok) throw new Error(`checkout failed: ${result.error}`);
  return result;
}

function paidSession(orderId: string, totalCents: number) {
  return fakeCompletedSession(
    `fake_cs_${orderId}_0`,
    orderId,
    totalCents,
    { email: 'ann@example.com', name: 'Ann Customer' },
    { line1: '1 Elm St', city: 'Concord', state: 'NH', postalCode: '03301' },
  );
}

describe('createCheckout', () => {
  it('creates a pending order with server-side prices and reserves inventory atomically', async () => {
    const result = await checkout([
      { sku: 'SGL-BLK', quantity: 2 },
      { sku: 'PR-MIX', quantity: 1 },
    ]);
    const order = await getOrderById(db, result.orderId);
    expect(order).toMatchObject({
      payment_status: 'pending',
      bag_count: 4,
      subtotal_cents: 3600,
      shipping_cents: 0,
      total_cents: 3600,
      is_preorder: 1,
      ships_by: '2026-12-11',
    });
    expect(order?.checkout_session_id).toMatch(/^fake_cs_/);
    expect(await available('SGL-BLK')).toBe(23);
    expect(await available('PR-MIX')).toBe(9);

    const items = await getOrderItems(db, result.orderId);
    expect(items.map((i) => [i.sku, i.quantity, i.unit_cents, i.reserved])).toEqual([
      ['SGL-BLK', 2, 900, 1],
      ['PR-MIX', 1, 1800, 1],
    ]);

    const sent = deps.payments.created[0]!;
    expect(sent.lineItems.map((l) => l.unitAmountCents)).toEqual([900, 1800]);
    expect(sent.shippingCents).toBe(0);
    expect(sent.submitMessage).toContain('Dec 11, 2026');
    expect(sent.successUrl).toBe('https://shop.test/checkout/success?session_id={CHECKOUT_SESSION_ID}');
  });

  it('applies bulk tier prices on the server', async () => {
    const result = await checkout([{ sku: 'SGL-BLK', quantity: 12 }]);
    expect((await getOrderById(db, result.orderId))?.subtotal_cents).toBe(12 * 750);
  });

  it('rejects quantities above what is left, without touching inventory', async () => {
    const result = await createCheckout(deps, [{ sku: 'PR-KFT', quantity: 6 }]);
    expect(result).toMatchObject({ ok: false, status: 409 });
    expect(await available('PR-KFT')).toBe(5);
  });

  it('rejects sold-out and inactive SKUs', async () => {
    await db.prepare("UPDATE inventory SET available = 0 WHERE sku = 'SGL-OLV'").run();
    await db.prepare("UPDATE inventory SET active = 0 WHERE sku = 'SGL-KFT'").run();
    expect(await createCheckout(deps, [{ sku: 'SGL-OLV', quantity: 1 }])).toMatchObject({
      ok: false,
      status: 409,
    });
    expect(await createCheckout(deps, [{ sku: 'SGL-KFT', quantity: 1 }])).toMatchObject({
      ok: false,
      status: 409,
    });
  });

  it('cannot over-sell under a race: the CHECK constraint rolls back the whole batch', async () => {
    // Simulate another buyer taking stock between our availability read and our write.
    const realBatch = db.batch.bind(db);
    let raced = false;
    const racingDb = new Proxy(db, {
      get(target, prop) {
        if (prop === 'batch') {
          return async (stmts: D1PreparedStatement[]) => {
            if (!raced) {
              raced = true;
              await target.prepare("UPDATE inventory SET available = 1 WHERE sku = 'PR-KFT'").run();
            }
            return realBatch(stmts);
          };
        }
        const value = Reflect.get(target, prop);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    const result = await createCheckout({ ...deps, db: racingDb }, [{ sku: 'PR-KFT', quantity: 3 }]);
    expect(result).toMatchObject({ ok: false, status: 409 });
    expect(await available('PR-KFT')).toBe(1);
    expect((await db.prepare('SELECT COUNT(*) AS n FROM orders').first<{ n: number }>())?.n).toBe(0);
  });

  it('treats NULL inventory as unlimited and does not mark the line reserved', async () => {
    await db.prepare("UPDATE inventory SET available = NULL, mode = 'in_stock' WHERE sku = 'SGL-BNE'").run();
    const result = await checkout([{ sku: 'SGL-BNE', quantity: 40 }]);
    expect(await available('SGL-BNE')).toBeNull();
    expect((await getOrderItems(db, result.orderId))[0]).toMatchObject({ reserved: 0, is_preorder: 0 });
    expect((await getOrderById(db, result.orderId))?.is_preorder).toBe(0);
  });

  it('releases the reservation and fails the order when the gateway errors', async () => {
    deps.payments.failNextCreate = true;
    const result = await createCheckout(deps, [{ sku: 'SGL-BLK', quantity: 3 }]);
    expect(result).toMatchObject({ ok: false, status: 502 });
    expect(await available('SGL-BLK')).toBe(25);
    const { results } = await db.prepare('SELECT payment_status, inventory_released FROM orders').all();
    expect(results).toEqual([{ payment_status: 'failed', inventory_released: 1 }]);
  });
});

describe('payment state transitions', () => {
  it('marks an order paid once, stores customer details, and alerts once', async () => {
    const { orderId } = await checkout([{ sku: 'SGL-BLK', quantity: 1 }]);
    const session = paidSession(orderId, 1300);
    expect(await applyCheckoutSession(deps, session)).toBe('paid');
    expect(await applyCheckoutSession(deps, session)).toBe('noop');

    const order = await getOrderById(db, orderId);
    expect(order).toMatchObject({
      payment_status: 'paid',
      amount_paid_cents: 1300,
      customer_email: 'ann@example.com',
      ship_city: 'Concord',
      needs_review: 0,
    });
    expect(deps.email.sent).toHaveLength(1);
    expect(deps.email.sent[0]?.subject).toContain(order!.number);
    expect(deps.email.sent[0]?.idempotencyKey).toBe(`order-paid-${orderId}`);
    expect(await available('SGL-BLK')).toBe(24);
  });

  it('flags an amount mismatch for review', async () => {
    const { orderId } = await checkout([{ sku: 'SGL-BLK', quantity: 1 }]);
    await applyCheckoutSession(deps, paidSession(orderId, 1));
    expect((await getOrderById(db, orderId))?.needs_review).toBe(1);
    expect(deps.email.sent[0]?.subject).toMatch(/^\[REVIEW\]/);
  });

  it('expires abandoned checkouts and returns stock exactly once', async () => {
    const { orderId } = await checkout([{ sku: 'SGL-BLK', quantity: 4 }]);
    expect(await available('SGL-BLK')).toBe(21);
    const expired = {
      ...paidSession(orderId, 0),
      status: 'expired' as const,
      paymentStatus: 'unpaid' as const,
    };
    expect(await applyCheckoutSession(deps, expired)).toBe('expired');
    expect(await applyCheckoutSession(deps, expired)).toBe('noop');
    expect(await available('SGL-BLK')).toBe(25);
    expect((await getOrderById(db, orderId))?.payment_status).toBe('expired');
  });

  it('records a late payment after expiry and flags it for review', async () => {
    const { orderId } = await checkout([{ sku: 'SGL-BLK', quantity: 1 }]);
    await applyCheckoutSession(deps, {
      ...paidSession(orderId, 0),
      status: 'expired',
      paymentStatus: 'unpaid',
    });
    expect(await applyCheckoutSession(deps, paidSession(orderId, 1300))).toBe('paid');
    expect(await getOrderById(db, orderId)).toMatchObject({ payment_status: 'paid', needs_review: 1 });
  });

  it('handles delayed payment methods: processing → paid, or processing → failed with release', async () => {
    const a = await checkout([{ sku: 'SGL-OLV', quantity: 2 }]);
    const processing = { ...paidSession(a.orderId, 1800), paymentStatus: 'unpaid' as const };
    expect(await applyCheckoutSession(deps, processing)).toBe('processing');
    expect(
      await handlePaymentEvent(deps, {
        id: 'evt_ok',
        kind: 'async_payment_succeeded',
        session: paidSession(a.orderId, 2200),
      }),
    ).toBe('paid');

    const b = await checkout([{ sku: 'SGL-OLV', quantity: 3 }]);
    await applyCheckoutSession(deps, { ...paidSession(b.orderId, 2700), paymentStatus: 'unpaid' });
    expect(await available('SGL-OLV')).toBe(20);
    expect(
      await handlePaymentEvent(deps, {
        id: 'evt_fail',
        kind: 'async_payment_failed',
        session: paidSession(b.orderId, 2700),
      }),
    ).toBe('failed');
    expect(await available('SGL-OLV')).toBe(23);
  });

  it('ignores duplicate webhook deliveries', async () => {
    const { orderId } = await checkout([{ sku: 'SGL-BLK', quantity: 1 }]);
    const event: PaymentEvent = {
      id: 'evt_1',
      kind: 'checkout_completed',
      session: paidSession(orderId, 1300),
    };
    expect(await handlePaymentEvent(deps, event)).toBe('paid');
    await db.prepare("UPDATE orders SET payment_status = 'pending' WHERE id = ?").bind(orderId).run();
    expect(await handlePaymentEvent(deps, event)).toBe('noop');
    expect(deps.email.sent).toHaveLength(1);
  });

  it('records refunds reported by Stripe (full and partial)', async () => {
    const { orderId } = await checkout([{ sku: 'SGL-BLK', quantity: 2 }]);
    await applyCheckoutSession(deps, paidSession(orderId, 2200));
    const pi = `fake_pi_${orderId}`;
    expect(
      await handlePaymentEvent(deps, {
        id: 'evt_r1',
        kind: 'charge_refunded',
        refund: { paymentIntentId: pi, amountCents: 2200, amountRefundedCents: 500 },
      }),
    ).toBe('refunded');
    expect((await getOrderById(db, orderId))?.payment_status).toBe('partially_refunded');
    expect(
      await handlePaymentEvent(deps, {
        id: 'evt_r2',
        kind: 'charge_refunded',
        refund: { paymentIntentId: pi, amountCents: 2200, amountRefundedCents: 2200 },
      }),
    ).toBe('refunded');
    expect(await getOrderById(db, orderId)).toMatchObject({
      payment_status: 'refunded',
      amount_refunded_cents: 2200,
    });
    expect(
      await handlePaymentEvent(deps, {
        id: 'evt_x',
        kind: 'charge_refunded',
        refund: { paymentIntentId: 'pi_unknown', amountCents: 1, amountRefundedCents: 1 },
      }),
    ).toBe('not_found');
  });
});

describe('admin refund', () => {
  it('refunds through the gateway, cancels fulfilment, restocks, and audits', async () => {
    const { orderId } = await checkout([{ sku: 'SGL-BLK', quantity: 3 }]);
    await applyCheckoutSession(deps, paidSession(orderId, 2700));
    expect(await available('SGL-BLK')).toBe(22);

    expect(await refundOrder(deps, orderId, { restock: true, actor: 'founder@example.com' })).toEqual({
      ok: true,
    });
    expect(deps.payments.refunds).toEqual([`fake_pi_${orderId}`]);
    expect(await getOrderById(db, orderId)).toMatchObject({
      payment_status: 'refunded',
      fulfillment_status: 'canceled',
      amount_refunded_cents: 2700,
    });
    expect(await available('SGL-BLK')).toBe(25);
    const audit = await db.prepare('SELECT actor, action FROM admin_audit_log').all();
    expect(audit.results).toEqual([{ actor: 'founder@example.com', action: 'order.refund' }]);

    expect(await refundOrder(deps, orderId, { restock: true, actor: 'x' })).toMatchObject({ ok: false });
    expect(await available('SGL-BLK')).toBe(25);
  });

  it('refuses to refund unpaid orders', async () => {
    const { orderId } = await checkout([{ sku: 'SGL-BLK', quantity: 1 }]);
    expect(await refundOrder(deps, orderId, { restock: true, actor: 'x' })).toMatchObject({ ok: false });
  });
});

describe('reconcileStalePendingOrders', () => {
  it('expires pending orders whose session has expired and leaves fresh ones alone', async () => {
    const stale = await checkout([{ sku: 'SGL-BLK', quantity: 2 }]);
    clock = new Date(clock.getTime() + 20 * 60_000);
    const fresh = await checkout([{ sku: 'SGL-BLK', quantity: 1 }]);

    clock = new Date(clock.getTime() + 25 * 60_000); // stale: 45 min old, fresh: 25 min old
    const result = await reconcileStalePendingOrders(deps);
    expect(result).toEqual({ checked: 1, changed: 1 });
    expect((await getOrderById(db, stale.orderId))?.payment_status).toBe('expired');
    expect((await getOrderById(db, fresh.orderId))?.payment_status).toBe('pending');
    expect(await available('SGL-BLK')).toBe(24);
  });

  it('expires orders that never got a checkout session', async () => {
    const { orderId } = await checkout([{ sku: 'SGL-BLK', quantity: 1 }]);
    await db
      .prepare('UPDATE orders SET checkout_session_id = NULL, checkout_expires_at = NULL WHERE id = ?')
      .bind(orderId)
      .run();
    clock = new Date(clock.getTime() + 60 * 60_000);
    expect(await reconcileStalePendingOrders(deps)).toEqual({ checked: 1, changed: 1 });
    expect(await available('SGL-BLK')).toBe(25);
  });
});
