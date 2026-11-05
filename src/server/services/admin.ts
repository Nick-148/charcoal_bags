/**
 * Admin write operations. Each mutation writes an audit log entry in the same batch (transaction).
 */
import { estimates } from '@/config/commerce';
import { allSkus } from '@/config/catalog';
import {
  auditStatement,
  getInquiry,
  getOrderById,
  type FulfillmentStatus,
  type InquiryStatus,
} from '@/server/db/queries';
import {
  fieldErrors,
  fulfillmentUpdateSchema,
  inquiryUpdateSchema,
  inventoryUpdateSchema,
} from '@/server/validation';

export type AdminResult =
  { ok: true; message: string } | { ok: false; error: string; fieldErrors?: Record<string, string> };

const SHIPPABLE_PAYMENT = new Set(['paid', 'partially_refunded']);

export async function updateFulfillment(
  db: D1Database,
  orderId: string,
  input: Record<string, string>,
  actor: string,
): Promise<AdminResult> {
  const parsed = fulfillmentUpdateSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: 'Fix the highlighted fields.', fieldErrors: fieldErrors(parsed.error) };
  const order = await getOrderById(db, orderId);
  if (!order) return { ok: false, error: 'Order not found.' };

  const next = parsed.data.fulfillmentStatus as FulfillmentStatus;
  if (next === 'canceled' && SHIPPABLE_PAYMENT.has(order.payment_status)) {
    // Cancelling a paid order must go through refundOrder so the customer is refunded and stock returned.
    return {
      ok: false,
      error: 'This order is paid. Use Refund to cancel it so the customer gets their money back.',
    };
  }
  if (next !== 'canceled' && next !== 'unfulfilled' && !SHIPPABLE_PAYMENT.has(order.payment_status)) {
    return { ok: false, error: `Cannot move an order that is ${order.payment_status} into ${next}.` };
  }
  if ((next === 'shipped' || next === 'delivered') && !parsed.data.trackingNumber && !order.tracking_number) {
    return {
      ok: false,
      error: 'Add a tracking number before marking the order shipped.',
      fieldErrors: { trackingNumber: 'Required to ship.' },
    };
  }

  const at = new Date().toISOString();
  await db.batch([
    db
      .prepare(
        `UPDATE orders SET fulfillment_status = ?, carrier = ?, tracking_number = ?, admin_notes = ?,
           shipped_at = CASE WHEN ? IN ('shipped', 'delivered') THEN COALESCE(shipped_at, ?) ELSE shipped_at END,
           updated_at = ?
         WHERE id = ?`,
      )
      .bind(
        next,
        parsed.data.carrier,
        parsed.data.trackingNumber,
        parsed.data.adminNotes,
        next,
        at,
        at,
        orderId,
      ),
    auditStatement(db, {
      actor,
      action: 'order.fulfillment_update',
      entityType: 'order',
      entityId: orderId,
      details: {
        from: order.fulfillment_status,
        to: next,
        carrier: parsed.data.carrier,
        tracking: parsed.data.trackingNumber,
      },
    }),
  ]);
  return { ok: true, message: `Order ${order.number} updated.` };
}

export async function updateInventory(
  db: D1Database,
  input: { sku: string; mode: string; available: string; shipsBy: string; active: boolean },
  actor: string,
): Promise<AdminResult> {
  const parsed = inventoryUpdateSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: 'Fix the highlighted fields.', fieldErrors: fieldErrors(parsed.error) };
  const { sku, mode, available, shipsBy, active } = parsed.data;
  if (!allSkus().includes(sku)) return { ok: false, error: `Unknown SKU ${sku}.` };
  if (mode === 'preorder' && !shipsBy) {
    return {
      ok: false,
      error: 'Pre-orders need a ship-by date (FTC Mail Order Rule).',
      fieldErrors: { shipsBy: 'Required for pre-orders.' },
    };
  }

  const at = new Date().toISOString();
  await db.batch([
    db
      .prepare(
        `INSERT INTO inventory (sku, mode, available, ships_by, active, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT (sku) DO UPDATE SET mode = ?2, available = ?3, ships_by = ?4, active = ?5, updated_at = ?6`,
      )
      .bind(sku, mode, available, shipsBy, active ? 1 : 0, at),
    auditStatement(db, {
      actor,
      action: 'inventory.update',
      entityType: 'inventory',
      entityId: sku,
      details: { mode, available, shipsBy, active },
    }),
  ]);
  return { ok: true, message: `${sku} saved.` };
}

export async function updateInquiry(
  db: D1Database,
  id: string,
  input: Record<string, string>,
  actor: string,
): Promise<AdminResult> {
  const parsed = inquiryUpdateSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: 'Fix the highlighted fields.', fieldErrors: fieldErrors(parsed.error) };
  const inquiry = await getInquiry(db, id);
  if (!inquiry) return { ok: false, error: 'Inquiry not found.' };
  const status = parsed.data.status as InquiryStatus;
  await db.batch([
    db
      .prepare('UPDATE inquiries SET status = ?, admin_notes = ?, updated_at = ? WHERE id = ?')
      .bind(status, parsed.data.adminNotes, new Date().toISOString(), id),
    auditStatement(db, {
      actor,
      action: 'inquiry.update',
      entityType: 'inquiry',
      entityId: id,
      details: { from: inquiry.status, to: status },
    }),
  ]);
  return { ok: true, message: 'Inquiry updated.' };
}

export interface DashboardStats {
  paidOrders: number;
  revenueCents: number;
  refundedCents: number;
  bagsSold: number;
  toFulfill: number;
  needsReview: number;
  openInquiries: number;
  monthRevenueCents: number;
  estimatedNetProfitCents: number;
  llcTriggerCents: number;
}

export async function getDashboardStats(db: D1Database, now = new Date()): Promise<DashboardStats> {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const [totals, month, fulfil, review, inquiries] = await db.batch<Record<string, number | null>>([
    db.prepare(
      `SELECT COUNT(*) AS orders, COALESCE(SUM(amount_paid_cents), 0) AS revenue,
              COALESCE(SUM(amount_refunded_cents), 0) AS refunded,
              COALESCE(SUM(CASE WHEN payment_status = 'refunded' THEN 0 ELSE bag_count END), 0) AS bags,
              COALESCE(SUM(CASE WHEN payment_status = 'refunded' THEN 0 ELSE shipping_cents END), 0) AS shipping
         FROM orders WHERE payment_status IN ('paid', 'partially_refunded', 'refunded')`,
    ),
    db
      .prepare(
        `SELECT COALESCE(SUM(amount_paid_cents - amount_refunded_cents), 0) AS revenue FROM orders
          WHERE payment_status IN ('paid', 'partially_refunded', 'refunded') AND paid_at >= ?`,
      )
      .bind(monthStart),
    db.prepare(
      `SELECT COUNT(*) AS n FROM orders WHERE payment_status IN ('paid', 'partially_refunded')
          AND fulfillment_status IN ('unfulfilled', 'in_production', 'ready_to_ship')`,
    ),
    db.prepare(
      "SELECT COUNT(*) AS n FROM orders WHERE needs_review = 1 AND fulfillment_status NOT IN ('shipped', 'delivered', 'canceled')",
    ),
    db.prepare("SELECT COUNT(*) AS n FROM inquiries WHERE status IN ('new', 'in_progress')"),
  ]);

  const t = totals?.results[0] ?? {};
  const paidOrders = Number(t['orders'] ?? 0);
  const revenueCents = Number(t['revenue'] ?? 0);
  const refundedCents = Number(t['refunded'] ?? 0);
  const bagsSold = Number(t['bags'] ?? 0);
  const netRevenue = revenueCents - refundedCents;
  // Rough estimate only: revenue − COGS − Stripe fees − label cost per order.
  const fees =
    Math.round(revenueCents * (estimates.stripePercent / 100)) + paidOrders * estimates.stripeFixedCents;
  const estimatedNetProfitCents =
    netRevenue - bagsSold * estimates.cogsPerBagCents - fees - paidOrders * estimates.shippingLabelCents;

  return {
    paidOrders,
    revenueCents: netRevenue,
    refundedCents,
    bagsSold,
    toFulfill: Number(fulfil?.results[0]?.['n'] ?? 0),
    needsReview: Number(review?.results[0]?.['n'] ?? 0),
    openInquiries: Number(inquiries?.results[0]?.['n'] ?? 0),
    monthRevenueCents: Number(month?.results[0]?.['revenue'] ?? 0),
    estimatedNetProfitCents,
    llcTriggerCents: estimates.llcTriggerNetProfitCents,
  };
}
