/**
 * Product catalog. Prices live in code (reviewed, versioned, testable); inventory, pre-order mode and
 * ship-by dates live in D1 and are edited from the admin. See docs/adr/0004-catalog-in-code-inventory-in-d1.md.
 *
 * Every SKU here needs a matching row in the `inventory` table (see migrations/0002_seed_inventory.sql);
 * a SKU without a row is treated as unavailable. Use the `add-product` skill when adding products.
 */

export type ColorwayId = 'blackout' | 'olive' | 'kraft' | 'bone';

export interface Colorway {
  id: ColorwayId;
  name: string;
  /** Canvas fill used by the SVG product art. */
  canvas: string;
  /** Stitching / print colour used by the SVG product art. */
  stitch: string;
  /** Short flavour line shown in the variant picker. */
  note: string;
}

export const colorways: Record<ColorwayId, Colorway> = {
  blackout: {
    id: 'blackout',
    name: 'Blackout',
    canvas: '#1d1d1d',
    stitch: '#c8a97e',
    note: 'Matte black duck canvas',
  },
  olive: {
    id: 'olive',
    name: 'Olive Drab',
    canvas: '#4b5320',
    stitch: '#f2eee6',
    note: 'Field-issue olive canvas',
  },
  kraft: { id: 'kraft', name: 'Kraft', canvas: '#c8a97e', stitch: '#111111', note: 'Natural tan canvas' },
  bone: { id: 'bone', name: 'Bone', canvas: '#ebe5d8', stitch: '#4b5320', note: 'Undyed off-white canvas' },
};

export interface Variant {
  sku: string;
  name: string;
  /** One colorway per bag in the unit (a pair has two). */
  colorways: readonly ColorwayId[];
}

export interface Product {
  slug: string;
  name: string;
  /** Bags shipped per unit — drives bulk tier pricing. */
  bagsPerUnit: number;
  priceCents: number;
  shortDescription: string;
  description: readonly string[];
  variants: readonly Variant[];
}

export const BAG_LIST_PRICE_CENTS = 900;

export const products: readonly Product[] = [
  {
    slug: 'the-single',
    name: 'The Single',
    bagsPerUnit: 1,
    priceCents: 900,
    shortDescription: 'One 4×4 bag. One pair of sneakers that stops clearing the room.',
    description: [
      'A mini cornhole-style bag in heavy-duty canvas with a dust-proof inner liner, packed with activated bamboo charcoal.',
      'Drop it in a sneaker, gym bag, locker, or glovebox. The charcoal’s porous structure traps odor molecules and excess moisture — no perfume masking, nothing plugged in.',
      'Recharge it in direct sunlight for 1–2 hours once a month and it keeps working for up to two years.',
    ],
    variants: [
      { sku: 'SGL-BLK', name: 'Blackout', colorways: ['blackout'] },
      { sku: 'SGL-OLV', name: 'Olive Drab', colorways: ['olive'] },
      { sku: 'SGL-KFT', name: 'Kraft', colorways: ['kraft'] },
      { sku: 'SGL-BNE', name: 'Bone', colorways: ['bone'] },
    ],
  },
  {
    slug: 'tailgate-pair',
    name: 'Tailgate Pair',
    bagsPerUnit: 2,
    priceCents: 1800,
    shortDescription: 'Two bags — one per shoe, or one for the bag and one for the car.',
    description: [
      'Two mini cornhole-style charcoal bags, because sneakers come in pairs and so does trash talk.',
      'Same heavy-duty canvas, dust-proof liner, and activated bamboo charcoal as The Single.',
      'Recharge both in the sun monthly. Toss them at a cup on your desk in between.',
    ],
    variants: [
      { sku: 'PR-BLK', name: 'Blackout ×2', colorways: ['blackout', 'blackout'] },
      { sku: 'PR-OLV', name: 'Olive Drab ×2', colorways: ['olive', 'olive'] },
      { sku: 'PR-MIX', name: 'Field Mix (Blackout + Olive)', colorways: ['blackout', 'olive'] },
      { sku: 'PR-KFT', name: 'Kraft ×2', colorways: ['kraft', 'kraft'] },
    ],
  },
];

export interface CatalogEntry {
  product: Product;
  variant: Variant;
}

const bySku = new Map<string, CatalogEntry>(
  products.flatMap((product) =>
    product.variants.map((variant) => [variant.sku, { product, variant }] as const),
  ),
);

export function findBySku(sku: string): CatalogEntry | undefined {
  return bySku.get(sku);
}

export function findProduct(slug: string): Product | undefined {
  return products.find((p) => p.slug === slug);
}

export function allSkus(): string[] {
  return [...bySku.keys()];
}

/** Specs shown on product pages. */
export const productSpecs = [
  { label: 'Size', value: 'Approx. 4 in × 4 in' },
  { label: 'Fill', value: 'Activated bamboo charcoal in a dust-proof inner liner' },
  { label: 'Shell', value: 'Heavy-duty canvas, double-stitched' },
  { label: 'Scent', value: 'None. Zero perfumes or dyes in the fill' },
  { label: 'Recharge', value: '1–2 hours of direct sunlight, monthly' },
  { label: 'Lifespan', value: 'Up to 2 years with regular recharging' },
] as const;
