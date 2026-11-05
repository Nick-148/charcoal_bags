-- Initial schema. See docs/adr/0003-cloudflare-d1.md and 0006-inventory-reservations.md.
-- Timestamps are ISO-8601 UTC strings; money is integer cents.

CREATE TABLE inventory (
  sku TEXT PRIMARY KEY,
  mode TEXT NOT NULL DEFAULT 'preorder' CHECK (mode IN ('in_stock', 'preorder')),
  -- Units that can still be sold. NULL = unlimited. The CHECK makes over-selling impossible:
  -- a reservation that would go negative fails and rolls back the whole checkout batch.
  available INTEGER CHECK (available IS NULL OR available >= 0),
  ships_by TEXT CHECK (ships_by IS NULL OR ships_by GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  number TEXT NOT NULL UNIQUE,
  payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (
    payment_status IN ('pending', 'processing', 'paid', 'failed', 'expired', 'refunded', 'partially_refunded')
  ),
  fulfillment_status TEXT NOT NULL DEFAULT 'unfulfilled' CHECK (
    fulfillment_status IN ('unfulfilled', 'in_production', 'ready_to_ship', 'shipped', 'delivered', 'canceled')
  ),
  currency TEXT NOT NULL DEFAULT 'usd',
  bag_count INTEGER NOT NULL CHECK (bag_count > 0),
  list_subtotal_cents INTEGER NOT NULL CHECK (list_subtotal_cents >= 0),
  subtotal_cents INTEGER NOT NULL CHECK (subtotal_cents >= 0),
  shipping_cents INTEGER NOT NULL CHECK (shipping_cents >= 0),
  tax_cents INTEGER NOT NULL DEFAULT 0 CHECK (tax_cents >= 0),
  total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
  amount_paid_cents INTEGER,
  amount_refunded_cents INTEGER NOT NULL DEFAULT 0,
  is_preorder INTEGER NOT NULL DEFAULT 0 CHECK (is_preorder IN (0, 1)),
  ships_by TEXT,
  checkout_session_id TEXT UNIQUE,
  checkout_expires_at TEXT,
  payment_intent_id TEXT,
  inventory_released INTEGER NOT NULL DEFAULT 0 CHECK (inventory_released IN (0, 1)),
  needs_review INTEGER NOT NULL DEFAULT 0 CHECK (needs_review IN (0, 1)),
  customer_email TEXT,
  customer_name TEXT,
  customer_phone TEXT,
  ship_name TEXT,
  ship_line1 TEXT,
  ship_line2 TEXT,
  ship_city TEXT,
  ship_state TEXT,
  ship_postal_code TEXT,
  ship_country TEXT,
  carrier TEXT,
  tracking_number TEXT,
  admin_notes TEXT,
  paid_at TEXT,
  shipped_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_orders_payment_status ON orders (payment_status, created_at);
CREATE INDEX idx_orders_fulfillment_status ON orders (fulfillment_status, created_at);
CREATE INDEX idx_orders_payment_intent ON orders (payment_intent_id);
CREATE INDEX idx_orders_pending_expiry ON orders (checkout_expires_at) WHERE payment_status = 'pending';

CREATE TABLE order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  sku TEXT NOT NULL,
  product_name TEXT NOT NULL,
  variant_name TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  bags_per_unit INTEGER NOT NULL CHECK (bags_per_unit > 0),
  list_unit_cents INTEGER NOT NULL CHECK (list_unit_cents >= 0),
  unit_cents INTEGER NOT NULL CHECK (unit_cents >= 0),
  is_preorder INTEGER NOT NULL DEFAULT 0 CHECK (is_preorder IN (0, 1)),
  ships_by TEXT,
  -- 1 when this line decremented a finite inventory count and must be returned on release.
  reserved INTEGER NOT NULL DEFAULT 0 CHECK (reserved IN (0, 1))
);

CREATE INDEX idx_order_items_order ON order_items (order_id);

CREATE TABLE inquiries (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('contact', 'bulk')),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_progress', 'replied', 'closed', 'spam')),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  topic TEXT,
  organization TEXT,
  quantity INTEGER,
  needed_by TEXT,
  customization TEXT,
  message TEXT NOT NULL,
  admin_notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_inquiries_status ON inquiries (status, created_at);

-- Stripe event ids we have fully processed (webhooks are delivered at-least-once).
CREATE TABLE processed_webhook_events (
  event_id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  processed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE admin_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  details TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_audit_entity ON admin_audit_log (entity_type, entity_id, created_at);
