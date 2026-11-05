/**
 * Typed read queries shared by services and admin pages. Writes live in the services that own them.
 * All SQL uses bound parameters — never interpolate values into SQL strings.
 */
import type { InventoryRow } from '@/lib/availability';

export type PaymentStatus =
  'pending' | 'processing' | 'paid' | 'failed' | 'expired' | 'refunded' | 'partially_refunded';
export type FulfillmentStatus =
  'unfulfilled' | 'in_production' | 'ready_to_ship' | 'shipped' | 'delivered' | 'canceled';

export const PAYMENT_STATUSES: readonly PaymentStatus[] = [
  'pending',
  'processing',
  'paid',
  'failed',
  'expired',
  'refunded',
  'partially_refunded',
];
export const FULFILLMENT_STATUSES: readonly FulfillmentStatus[] = [
  'unfulfilled',
  'in_production',
  'ready_to_ship',
  'shipped',
  'delivered',
  'canceled',
];

export interface OrderRow {
  id: string;
  number: string;
  payment_status: PaymentStatus;
  fulfillment_status: FulfillmentStatus;
  currency: string;
  bag_count: number;
  list_subtotal_cents: number;
  subtotal_cents: number;
  shipping_cents: number;
  tax_cents: number;
  total_cents: number;
  amount_paid_cents: number | null;
  amount_refunded_cents: number;
  is_preorder: number;
  ships_by: string | null;
  checkout_session_id: string | null;
  checkout_expires_at: string | null;
  payment_intent_id: string | null;
  inventory_released: number;
  needs_review: number;
  customer_email: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  ship_name: string | null;
  ship_line1: string | null;
  ship_line2: string | null;
  ship_city: string | null;
  ship_state: string | null;
  ship_postal_code: string | null;
  ship_country: string | null;
  carrier: string | null;
  tracking_number: string | null;
  admin_notes: string | null;
  paid_at: string | null;
  shipped_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderItemRow {
  id: number;
  order_id: string;
  sku: string;
  product_name: string;
  variant_name: string;
  quantity: number;
  bags_per_unit: number;
  list_unit_cents: number;
  unit_cents: number;
  is_preorder: number;
  ships_by: string | null;
  reserved: number;
}

export type InquiryKind = 'contact' | 'bulk';
export type InquiryStatus = 'new' | 'in_progress' | 'replied' | 'closed' | 'spam';
export const INQUIRY_STATUSES: readonly InquiryStatus[] = ['new', 'in_progress', 'replied', 'closed', 'spam'];

export interface InquiryRow {
  id: string;
  kind: InquiryKind;
  status: InquiryStatus;
  name: string;
  email: string;
  topic: string | null;
  organization: string | null;
  quantity: number | null;
  needed_by: string | null;
  customization: string | null;
  message: string;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuditRow {
  id: number;
  actor: string;
  action: string;
  entity_type: string;
  entity_id: string;
  details: string | null;
  created_at: string;
}

export async function getInventoryRows(db: D1Database, skus?: readonly string[]): Promise<InventoryRow[]> {
  if (skus && skus.length === 0) return [];
  const stmt = skus
    ? db.prepare(`SELECT * FROM inventory WHERE sku IN (${skus.map(() => '?').join(',')})`).bind(...skus)
    : db.prepare('SELECT * FROM inventory ORDER BY sku');
  const { results } = await stmt.all<InventoryRow>();
  return results;
}

export async function getInventoryMap(
  db: D1Database,
  skus?: readonly string[],
): Promise<Map<string, InventoryRow>> {
  return new Map((await getInventoryRows(db, skus)).map((row) => [row.sku, row]));
}

export function getOrderById(db: D1Database, id: string): Promise<OrderRow | null> {
  return db.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first<OrderRow>();
}

export function getOrderByNumber(db: D1Database, number: string): Promise<OrderRow | null> {
  return db.prepare('SELECT * FROM orders WHERE number = ?').bind(number).first<OrderRow>();
}

export function getOrderBySessionId(db: D1Database, sessionId: string): Promise<OrderRow | null> {
  return db.prepare('SELECT * FROM orders WHERE checkout_session_id = ?').bind(sessionId).first<OrderRow>();
}

export function getOrderByPaymentIntent(db: D1Database, paymentIntentId: string): Promise<OrderRow | null> {
  return db
    .prepare('SELECT * FROM orders WHERE payment_intent_id = ?')
    .bind(paymentIntentId)
    .first<OrderRow>();
}

export async function getOrderItems(db: D1Database, orderId: string): Promise<OrderItemRow[]> {
  const { results } = await db
    .prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY id')
    .bind(orderId)
    .all<OrderItemRow>();
  return results;
}

export type OrderListFilter = 'to_fulfill' | 'shipped' | 'pending' | 'refunded' | 'all';

const ORDER_FILTERS: Record<OrderListFilter, string> = {
  to_fulfill:
    "payment_status IN ('paid', 'partially_refunded') AND fulfillment_status IN ('unfulfilled', 'in_production', 'ready_to_ship')",
  shipped: "fulfillment_status IN ('shipped', 'delivered')",
  pending: "payment_status IN ('pending', 'processing')",
  refunded: "payment_status IN ('refunded', 'partially_refunded') OR fulfillment_status = 'canceled'",
  all: '1 = 1',
};

export function isOrderListFilter(value: string | null): value is OrderListFilter {
  return value !== null && value in ORDER_FILTERS;
}

export async function listOrders(
  db: D1Database,
  filter: OrderListFilter,
  { limit = 50, offset = 0 } = {},
): Promise<OrderRow[]> {
  // ORDER_FILTERS values are constants defined above — never user input.
  const { results } = await db
    .prepare(`SELECT * FROM orders WHERE ${ORDER_FILTERS[filter]} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .bind(Math.min(limit, 200), Math.max(offset, 0))
    .all<OrderRow>();
  return results;
}

export async function listItemsForOrders(
  db: D1Database,
  orderIds: readonly string[],
): Promise<Map<string, OrderItemRow[]>> {
  const map = new Map<string, OrderItemRow[]>();
  if (orderIds.length === 0) return map;
  const { results } = await db
    .prepare(`SELECT * FROM order_items WHERE order_id IN (${orderIds.map(() => '?').join(',')}) ORDER BY id`)
    .bind(...orderIds)
    .all<OrderItemRow>();
  for (const item of results) map.set(item.order_id, [...(map.get(item.order_id) ?? []), item]);
  return map;
}

export async function listInquiries(
  db: D1Database,
  { status, limit = 100 }: { status?: InquiryStatus | 'open'; limit?: number } = {},
): Promise<InquiryRow[]> {
  const where =
    status === 'open' ? "WHERE status IN ('new', 'in_progress')" : status ? 'WHERE status = ?' : '';
  const stmt = db.prepare(`SELECT * FROM inquiries ${where} ORDER BY created_at DESC LIMIT ?`);
  const bound = status && status !== 'open' ? stmt.bind(status, limit) : stmt.bind(limit);
  const { results } = await bound.all<InquiryRow>();
  return results;
}

export function getInquiry(db: D1Database, id: string): Promise<InquiryRow | null> {
  return db.prepare('SELECT * FROM inquiries WHERE id = ?').bind(id).first<InquiryRow>();
}

export async function getAuditTrail(
  db: D1Database,
  entityType: string,
  entityId: string,
): Promise<AuditRow[]> {
  const { results } = await db
    .prepare(
      'SELECT * FROM admin_audit_log WHERE entity_type = ? AND entity_id = ? ORDER BY id DESC LIMIT 50',
    )
    .bind(entityType, entityId)
    .all<AuditRow>();
  return results;
}

export function auditStatement(
  db: D1Database,
  entry: { actor: string; action: string; entityType: string; entityId: string; details?: unknown },
): D1PreparedStatement {
  return db
    .prepare(
      'INSERT INTO admin_audit_log (actor, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)',
    )
    .bind(
      entry.actor,
      entry.action,
      entry.entityType,
      entry.entityId,
      entry.details === undefined ? null : JSON.stringify(entry.details),
    );
}
