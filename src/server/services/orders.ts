/**
 * Order lifecycle: checkout creation with atomic inventory reservation, payment state transitions
 * driven by webhooks/reconciliation, and inventory release. Every transition is a conditional UPDATE,
 * so replays (webhook retries, cron overlap) are no-ops. See docs/adr/0005 and 0006.
 */
import { shipping, limits } from '@/config/commerce';
import { site } from '@/config/site';
import { formatShipDate, isPurchasable, latestShipDate, toAvailability } from '@/lib/availability';
import { priceCart, type CartLineInput } from '@/lib/pricing';
import {
  auditStatement,
  getInventoryMap,
  getOrderById,
  getOrderByPaymentIntent,
  getOrderBySessionId,
  getOrderItems,
  PAYMENT_STATUSES,
  type OrderRow,
  type PaymentStatus,
} from '@/server/db/queries';
import type { EmailSender } from '@/server/email';
import { newOrderAlert } from '@/server/email/templates';
import { newId, newOrderNumber } from '@/server/ids';
import type { Logger } from '@/server/logger';
import type {
  CheckoutSessionSnapshot,
  PaymentEvent,
  PaymentGateway,
  RefundSnapshot,
} from '@/server/payments/types';

export interface OrderServiceDeps {
  db: D1Database;
  payments: PaymentGateway;
  email: EmailSender;
  logger: Logger;
  alertEmailTo: readonly string[];
  /** Public origin used for redirect URLs and admin links. */
  origin: string;
  now?: () => Date;
}

const now = (deps: OrderServiceDeps) => deps.now?.() ?? new Date();

export interface CheckoutIssue {
  sku?: string;
  message: string;
}

export type CheckoutResult =
  | { ok: true; url: string; orderId: string; orderNumber: string }
  | { ok: false; status: 400 | 409 | 502; error: string; issues: CheckoutIssue[] };

function isStockConstraintViolation(error: unknown): boolean {
  // Only the inventory CHECK (available >= 0) means "out of stock"; other constraint failures are real bugs.
  return error instanceof Error && /CHECK constraint failed/i.test(error.message);
}

/**
 * Statements that return an order's reserved units to inventory exactly once. When `guard` is given, the
 * release only happens if the order is still in one of those payment states at execution time — run these
 * in the same `db.batch` (one transaction) as the status change they belong to.
 */
function releaseStatements(
  db: D1Database,
  orderId: string,
  at: string,
  guard: readonly PaymentStatus[] | null,
): D1PreparedStatement[] {
  // Guard values come from the typed PaymentStatus whitelist, never from user input.
  const statusClause = guard
    ? ` AND payment_status IN (${guard
        .filter((s) => PAYMENT_STATUSES.includes(s))
        .map((s) => `'${s}'`)
        .join(', ')})`
    : '';
  return [
    db
      .prepare(
        `UPDATE inventory
           SET available = available + (
                 SELECT COALESCE(SUM(oi.quantity), 0) FROM order_items oi
                  WHERE oi.order_id = ?1 AND oi.sku = inventory.sku AND oi.reserved = 1),
               updated_at = ?2
         WHERE sku IN (SELECT sku FROM order_items WHERE order_id = ?1 AND reserved = 1)
           AND EXISTS (SELECT 1 FROM orders WHERE id = ?1 AND inventory_released = 0${statusClause})`,
      )
      .bind(orderId, at),
    db
      .prepare(
        `UPDATE orders SET inventory_released = 1, updated_at = ?2 WHERE id = ?1 AND inventory_released = 0${statusClause}`,
      )
      .bind(orderId, at),
  ];
}

export async function createCheckout(
  deps: OrderServiceDeps,
  input: readonly CartLineInput[],
): Promise<CheckoutResult> {
  const priced = priceCart(input);
  if (!priced.ok) {
    return { ok: false, status: 400, error: 'Please review your cart.', issues: priced.issues };
  }
  const cart = priced.cart;

  const inventory = await getInventoryMap(
    deps.db,
    cart.lines.map((l) => l.sku),
  );
  const issues: CheckoutIssue[] = [];
  const lines = cart.lines.map((line) => {
    const availability = toAvailability(line.sku, inventory.get(line.sku));
    if (!isPurchasable(availability)) {
      issues.push({ sku: line.sku, message: `${line.productName} (${line.variantName}) is sold out.` });
    } else if (availability.remaining !== null && line.quantity > availability.remaining) {
      issues.push({
        sku: line.sku,
        message: `Only ${availability.remaining} left of ${line.productName} (${line.variantName}).`,
      });
    }
    return { ...line, availability };
  });
  if (issues.length > 0) {
    return { ok: false, status: 409, error: 'Some items are no longer available in that quantity.', issues };
  }

  const createdAt = now(deps);
  const at = createdAt.toISOString();
  const orderId = newId();
  const orderNumber = newOrderNumber(site.orderPrefix);
  const preorderLines = lines.filter((l) => l.availability.status === 'preorder');
  const shipsBy = latestShipDate(preorderLines.map((l) => l.availability.shipsBy));
  const isPreorder = preorderLines.length > 0;

  const statements: D1PreparedStatement[] = [
    deps.db
      .prepare(
        `INSERT INTO orders (id, number, payment_status, bag_count, list_subtotal_cents, subtotal_cents,
            shipping_cents, tax_cents, total_cents, is_preorder, ships_by, created_at, updated_at)
         VALUES (?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        orderId,
        orderNumber,
        cart.bagCount,
        cart.listSubtotalCents,
        cart.subtotalCents,
        cart.shippingCents,
        cart.taxCents,
        cart.totalCents,
        isPreorder ? 1 : 0,
        shipsBy,
        at,
        at,
      ),
  ];
  for (const line of lines) {
    statements.push(
      // Reserve finite stock. The CHECK (available >= 0) aborts the whole batch on over-sell.
      deps.db
        .prepare(
          'UPDATE inventory SET available = available - ?2, updated_at = ?3 WHERE sku = ?1 AND active = 1 AND available IS NOT NULL',
        )
        .bind(line.sku, line.quantity, at),
      deps.db
        .prepare(
          `INSERT INTO order_items (order_id, sku, product_name, variant_name, quantity, bags_per_unit,
              list_unit_cents, unit_cents, is_preorder, ships_by, reserved)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10,
              (SELECT CASE WHEN available IS NOT NULL AND active = 1 THEN 1 ELSE 0 END FROM inventory WHERE sku = ?2))`,
        )
        .bind(
          orderId,
          line.sku,
          line.productName,
          line.variantName,
          line.quantity,
          line.bagsPerUnit,
          line.listUnitCents,
          line.unitCents,
          line.availability.status === 'preorder' ? 1 : 0,
          line.availability.shipsBy,
        ),
    );
  }

  try {
    await deps.db.batch(statements);
  } catch (error) {
    if (isStockConstraintViolation(error)) {
      return {
        ok: false,
        status: 409,
        error: 'Someone just grabbed the last of an item in your cart. Please review quantities.',
        issues: [],
      };
    }
    throw error;
  }

  const log = deps.logger.child({ orderId, orderNumber });
  const expiresAt = new Date(createdAt.getTime() + limits.checkoutSessionTtlMinutes * 60_000);
  try {
    const session = await deps.payments.createCheckoutSession({
      orderId,
      orderNumber,
      lineItems: lines.map((l) => ({
        sku: l.sku,
        name: `${l.productName} — ${l.variantName}`,
        description:
          l.availability.status === 'preorder'
            ? `Founder’s Pre-Order${l.availability.shipsBy ? ` · ships by ${formatShipDate(l.availability.shipsBy)}` : ''}`
            : cart.tier
              ? `${cart.tier.label} applied`
              : undefined,
        unitAmountCents: l.unitCents,
        quantity: l.quantity,
      })),
      shippingCents: cart.shippingCents,
      shippingLabel: cart.shippingCents === 0 ? shipping.freeLabel : shipping.standardLabel,
      allowedCountries: shipping.allowedCountries,
      successUrl: `${deps.origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${deps.origin}/cart?checkout=canceled`,
      expiresAt,
      ...(isPreorder
        ? {
            submitMessage: `Founder’s Pre-Order: your card is charged today and your order ships ${shipsBy ? `by ${formatShipDate(shipsBy)}` : 'within 30 days'}. Cancel any time before it ships for a full refund.`,
          }
        : {}),
    });

    await deps.db
      .prepare(
        'UPDATE orders SET checkout_session_id = ?, checkout_expires_at = ?, updated_at = ? WHERE id = ?',
      )
      .bind(session.sessionId, session.expiresAt.toISOString(), now(deps).toISOString(), orderId)
      .run();
    log.info('checkout.created', {
      bagCount: cart.bagCount,
      totalCents: cart.totalCents,
      gateway: deps.payments.name,
    });
    return { ok: true, url: session.url, orderId, orderNumber };
  } catch (error) {
    log.error('checkout.gateway_failed', error);
    const failedAt = now(deps).toISOString();
    await deps.db.batch([
      ...releaseStatements(deps.db, orderId, failedAt, ['pending']),
      deps.db
        .prepare(
          "UPDATE orders SET payment_status = 'failed', updated_at = ? WHERE id = ? AND payment_status = 'pending'",
        )
        .bind(failedAt, orderId),
    ]);
    return {
      ok: false,
      status: 502,
      error: 'Checkout is temporarily unavailable. Nothing was charged — please try again in a minute.',
      issues: [],
    };
  }
}

async function findOrderForSession(
  db: D1Database,
  snapshot: CheckoutSessionSnapshot,
): Promise<OrderRow | null> {
  if (snapshot.orderId) {
    const order = await getOrderById(db, snapshot.orderId);
    if (order) return order;
  }
  return getOrderBySessionId(db, snapshot.sessionId);
}

export type TransitionOutcome =
  'paid' | 'processing' | 'expired' | 'failed' | 'refunded' | 'noop' | 'not_found';

async function notifyPaid(deps: OrderServiceDeps, orderId: string): Promise<void> {
  if (deps.alertEmailTo.length === 0) {
    deps.logger.warn('order.alert_skipped_no_recipient', { orderId });
    return;
  }
  const order = await getOrderById(deps.db, orderId);
  if (!order) return;
  const items = await getOrderItems(deps.db, orderId);
  const message = newOrderAlert({
    number: order.number,
    totalCents: order.amount_paid_cents ?? order.total_cents,
    bagCount: order.bag_count,
    isPreorder: order.is_preorder === 1,
    shipsBy: order.ships_by,
    customerName: order.customer_name,
    shipCity: order.ship_city,
    shipState: order.ship_state,
    items: items.map((i) => ({
      productName: i.product_name,
      variantName: i.variant_name,
      quantity: i.quantity,
    })),
    adminUrl: `${deps.origin}/admin/orders/${order.number}`,
    needsReview: order.needs_review === 1,
  });
  try {
    await deps.email.send({
      to: [...deps.alertEmailTo],
      ...message,
      idempotencyKey: `order-paid-${orderId}`,
    });
  } catch (error) {
    // The order is safely recorded; a failed alert must never fail the webhook.
    deps.logger.error('order.alert_failed', error, { orderId });
  }
}

async function markPaid(
  deps: OrderServiceDeps,
  order: OrderRow,
  s: CheckoutSessionSnapshot,
): Promise<TransitionOutcome> {
  const at = now(deps).toISOString();
  const amountMismatch = s.amountTotalCents !== null && s.amountTotalCents !== order.total_cents;
  if (amountMismatch) {
    deps.logger.warn('order.amount_mismatch', {
      orderId: order.id,
      expected: order.total_cents,
      received: s.amountTotalCents,
    });
  }
  const address = s.shipping?.address;
  const result = await deps.db
    .prepare(
      `UPDATE orders SET
         payment_status = 'paid',
         paid_at = ?1,
         amount_paid_cents = ?2,
         payment_intent_id = COALESCE(?3, payment_intent_id),
         checkout_session_id = COALESCE(checkout_session_id, ?4),
         customer_email = ?5, customer_name = ?6, customer_phone = ?7,
         ship_name = ?8, ship_line1 = ?9, ship_line2 = ?10, ship_city = ?11, ship_state = ?12,
         ship_postal_code = ?13, ship_country = ?14,
         needs_review = CASE WHEN inventory_released = 1 OR ?15 = 1 THEN 1 ELSE needs_review END,
         updated_at = ?1
       WHERE id = ?16 AND payment_status IN ('pending', 'processing', 'expired', 'failed')`,
    )
    .bind(
      at,
      s.amountTotalCents ?? order.total_cents,
      s.paymentIntentId,
      s.sessionId,
      s.customer?.email ?? null,
      s.customer?.name ?? null,
      s.customer?.phone ?? null,
      s.shipping?.name ?? null,
      address?.line1 ?? null,
      address?.line2 ?? null,
      address?.city ?? null,
      address?.state ?? null,
      address?.postalCode ?? null,
      address?.country ?? null,
      amountMismatch ? 1 : 0,
      order.id,
    )
    .run();
  if (result.meta.changes !== 1) return 'noop';
  deps.logger.info('order.paid', { orderId: order.id, orderNumber: order.number });
  await notifyPaid(deps, order.id);
  return 'paid';
}

async function expireOrFail(
  deps: OrderServiceDeps,
  order: OrderRow,
  to: 'expired' | 'failed',
  from: readonly ('pending' | 'processing')[],
): Promise<TransitionOutcome> {
  const at = now(deps).toISOString();
  const placeholders = from.map(() => '?').join(', ');
  const results = await deps.db.batch([
    ...releaseStatements(deps.db, order.id, at, from),
    deps.db
      .prepare(
        `UPDATE orders SET payment_status = ?, updated_at = ? WHERE id = ? AND payment_status IN (${placeholders})`,
      )
      .bind(to, at, order.id, ...from),
  ]);
  if (results.at(-1)?.meta.changes !== 1) return 'noop';
  deps.logger.info(`order.${to}`, { orderId: order.id });
  return to;
}

/** Applies the authoritative state of a Checkout Session to its order. Safe to call repeatedly. */
export async function applyCheckoutSession(
  deps: OrderServiceDeps,
  snapshot: CheckoutSessionSnapshot,
): Promise<TransitionOutcome> {
  const order = await findOrderForSession(deps.db, snapshot);
  if (!order) {
    deps.logger.warn('order.session_without_order', { sessionId: snapshot.sessionId });
    return 'not_found';
  }
  if (snapshot.status === 'expired') return expireOrFail(deps, order, 'expired', ['pending']);
  if (snapshot.status !== 'complete') return 'noop';
  if (snapshot.paymentStatus === 'paid' || snapshot.paymentStatus === 'no_payment_required') {
    return markPaid(deps, order, snapshot);
  }
  // Completed but unpaid = a delayed payment method is still processing.
  const at = now(deps).toISOString();
  const result = await deps.db
    .prepare(
      `UPDATE orders SET payment_status = 'processing', payment_intent_id = COALESCE(?, payment_intent_id),
         customer_email = ?, customer_name = ?, updated_at = ?
       WHERE id = ? AND payment_status = 'pending'`,
    )
    .bind(
      snapshot.paymentIntentId,
      snapshot.customer?.email ?? null,
      snapshot.customer?.name ?? null,
      at,
      order.id,
    )
    .run();
  return result.meta.changes === 1 ? 'processing' : 'noop';
}

export async function applyRefund(
  deps: OrderServiceDeps,
  refund: RefundSnapshot,
): Promise<TransitionOutcome> {
  const order = await getOrderByPaymentIntent(deps.db, refund.paymentIntentId);
  if (!order) return 'not_found';
  const full = refund.amountRefundedCents >= refund.amountCents;
  const result = await deps.db
    .prepare(
      `UPDATE orders SET payment_status = ?, amount_refunded_cents = ?, updated_at = ?
       WHERE id = ? AND payment_status IN ('paid', 'partially_refunded', 'refunded')
         AND (payment_status != ? OR amount_refunded_cents != ?)`,
    )
    .bind(
      full ? 'refunded' : 'partially_refunded',
      refund.amountRefundedCents,
      now(deps).toISOString(),
      order.id,
      full ? 'refunded' : 'partially_refunded',
      refund.amountRefundedCents,
    )
    .run();
  return result.meta.changes === 1 ? 'refunded' : 'noop';
}

/** Entry point for verified gateway webhooks. Duplicate deliveries are acknowledged without re-processing. */
export async function handlePaymentEvent(
  deps: OrderServiceDeps,
  event: PaymentEvent,
): Promise<TransitionOutcome> {
  const seen = await deps.db
    .prepare('SELECT 1 FROM processed_webhook_events WHERE event_id = ?')
    .bind(event.id)
    .first();
  if (seen) return 'noop';

  let outcome: TransitionOutcome = 'noop';
  switch (event.kind) {
    case 'checkout_completed':
    case 'checkout_expired':
    case 'async_payment_succeeded':
      outcome = await applyCheckoutSession(deps, event.session);
      break;
    case 'async_payment_failed': {
      const order = await findOrderForSession(deps.db, event.session);
      outcome = order ? await expireOrFail(deps, order, 'failed', ['pending', 'processing']) : 'not_found';
      break;
    }
    case 'charge_refunded':
      outcome = await applyRefund(deps, event.refund);
      break;
    case 'ignored':
      break;
  }

  await deps.db
    .prepare(
      'INSERT INTO processed_webhook_events (event_id, type) VALUES (?, ?) ON CONFLICT (event_id) DO NOTHING',
    )
    .bind(event.id, event.kind === 'ignored' ? event.type : event.kind)
    .run();
  return outcome;
}

/**
 * Cron backstop: asks the gateway about pending orders whose Checkout Session should have expired and
 * applies whatever it reports (expired → release stock; complete → mark paid if a webhook was missed).
 */
export async function reconcileStalePendingOrders(
  deps: OrderServiceDeps,
  { graceMinutes = 10, batchSize = 25 } = {},
): Promise<{ checked: number; changed: number }> {
  const cutoff = new Date(now(deps).getTime() - graceMinutes * 60_000).toISOString();
  const { results } = await deps.db
    .prepare(
      `SELECT * FROM orders WHERE payment_status = 'pending'
         AND (checkout_expires_at < ?1 OR (checkout_expires_at IS NULL AND created_at < ?1))
       ORDER BY created_at LIMIT ?2`,
    )
    .bind(cutoff, batchSize)
    .all<OrderRow>();

  let changed = 0;
  for (const order of results) {
    try {
      const outcome = order.checkout_session_id
        ? await applyCheckoutSession(
            deps,
            await deps.payments.retrieveCheckoutSession(order.checkout_session_id),
          )
        : // No session was ever attached (gateway call died mid-flight): nothing can be paid, so expire it.
          await expireOrFail(deps, order, 'expired', ['pending']);
      if (outcome !== 'noop' && outcome !== 'not_found') changed++;
    } catch (error) {
      deps.logger.error('reconcile.order_failed', error, { orderId: order.id });
    }
  }
  return { checked: results.length, changed };
}

/** Admin action: refund the full payment, cancel fulfilment, optionally return reserved stock. */
export async function refundOrder(
  deps: OrderServiceDeps,
  orderId: string,
  { restock, actor }: { restock: boolean; actor: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const order = await getOrderById(deps.db, orderId);
  if (!order) return { ok: false, error: 'Order not found.' };
  if (order.payment_status !== 'paid' && order.payment_status !== 'partially_refunded') {
    return { ok: false, error: `Orders that are ${order.payment_status} cannot be refunded.` };
  }
  if (!order.payment_intent_id) return { ok: false, error: 'This order has no payment to refund.' };

  let refund: RefundSnapshot;
  try {
    refund = await deps.payments.refund(order.payment_intent_id, `refund-${order.id}`);
  } catch (error) {
    deps.logger.error('order.refund_failed', error, { orderId });
    return { ok: false, error: 'The payment provider rejected the refund. Check the Stripe dashboard.' };
  }

  const at = now(deps).toISOString();
  const refundedCents = Math.max(refund.amountRefundedCents, order.amount_paid_cents ?? order.total_cents);
  await deps.db.batch([
    ...(restock ? releaseStatements(deps.db, order.id, at, ['paid', 'partially_refunded']) : []),
    deps.db
      .prepare(
        `UPDATE orders SET payment_status = 'refunded', amount_refunded_cents = ?,
           fulfillment_status = CASE WHEN fulfillment_status IN ('shipped', 'delivered') THEN fulfillment_status ELSE 'canceled' END,
           updated_at = ?
         WHERE id = ?`,
      )
      .bind(refundedCents, at, order.id),
    auditStatement(deps.db, {
      actor,
      action: 'order.refund',
      entityType: 'order',
      entityId: order.id,
      details: { restock, refundedCents },
    }),
  ]);
  deps.logger.info('order.refunded', { orderId, restock });
  return { ok: true };
}
