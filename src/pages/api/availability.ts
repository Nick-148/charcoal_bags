import type { APIRoute } from 'astro';
import { findBySku } from '@/config/catalog';
import { limits } from '@/config/commerce';
import { toAvailability } from '@/lib/availability';
import { getInventoryMap } from '@/server/db/queries';
import { json, jsonError } from '@/server/http';
import { getDb } from '@/server/runtime';

export const prerender = false;

/** Public, cacheable availability lookup used by the cart. Only known SKUs are queried. */
export const GET: APIRoute = async ({ url }) => {
  const skus = [...new Set((url.searchParams.get('skus') ?? '').split(','))]
    .filter((sku) => findBySku(sku))
    .slice(0, limits.maxLines);
  if (skus.length === 0) return jsonError(400, 'Provide ?skus=SKU1,SKU2');

  const inventory = await getInventoryMap(getDb(), skus);
  return json(
    { availability: skus.map((sku) => toAvailability(sku, inventory.get(sku))) },
    { headers: { 'Cache-Control': 'public, max-age=30' } },
  );
};
