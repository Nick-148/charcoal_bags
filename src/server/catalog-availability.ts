/** Joins the code catalog with live inventory rows for storefront pages. */
import { products, type Product } from '@/config/catalog';
import { toAvailability, type Availability } from '@/lib/availability';
import { getInventoryMap } from '@/server/db/queries';

export interface ProductWithAvailability {
  product: Product;
  availability: Map<string, Availability>;
  /** Summary for cards: preorder if any variant is on pre-order, sold out if none purchasable. */
  status: 'in_stock' | 'preorder' | 'sold_out';
}

export async function loadCatalogAvailability(db: D1Database): Promise<ProductWithAvailability[]> {
  const inventory = await getInventoryMap(db);
  return products.map((product) => {
    const availability = new Map(
      product.variants.map((v) => [v.sku, toAvailability(v.sku, inventory.get(v.sku))]),
    );
    const statuses = [...availability.values()].map((a) => a.status);
    const status = statuses.includes('in_stock')
      ? 'in_stock'
      : statuses.includes('preorder')
        ? 'preorder'
        : 'sold_out';
    return { product, availability, status };
  });
}
