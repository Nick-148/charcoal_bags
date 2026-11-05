import type { APIRoute } from 'astro';
import { toCsv } from '@/server/csv';
import { listItemsForOrders, listOrders } from '@/server/db/queries';
import { getDb } from '@/server/runtime';

export const prerender = false;

/**
 * Paid orders that still need to ship, in a shape that imports cleanly into Pirate Ship / USPS
 * Click-N-Ship (map columns on first import). Admin-only via middleware.
 */
export const GET: APIRoute = async () => {
  const db = getDb();
  const orders = await listOrders(db, 'to_fulfill', { limit: 200 });
  const items = await listItemsForOrders(
    db,
    orders.map((o) => o.id),
  );
  const csv = toCsv(
    [
      'Order',
      'Name',
      'Address 1',
      'Address 2',
      'City',
      'State',
      'Zip',
      'Country',
      'Email',
      'Bags',
      'Items',
      'Pre-order ships by',
    ],
    orders.map((o) => [
      o.number,
      o.ship_name ?? o.customer_name,
      o.ship_line1,
      o.ship_line2,
      o.ship_city,
      o.ship_state,
      o.ship_postal_code,
      o.ship_country,
      o.customer_email,
      o.bag_count,
      (items.get(o.id) ?? []).map((i) => `${i.quantity}x ${i.sku}`).join(' '),
      o.is_preorder ? o.ships_by : '',
    ]),
  );
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="to-ship-${stamp}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
};
