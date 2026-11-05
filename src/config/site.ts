/**
 * Brand + contact configuration — the single source of truth for anything a rebrand touches.
 *
 * The brand name is PROVISIONAL (see docs/adr/0010-provisional-brand-in-config.md). To rebrand:
 *   1. Edit this file (name, tagline, voice copy, contact, socials).
 *   2. Edit the colour/typography tokens in src/styles/global.css.
 *   3. Run `npm run verify` and skim the pages. No other code should hard-code brand strings.
 *
 * Contact details below are placeholders until the founder confirms them (see PLAN.md → Blockers).
 */
export const site = {
  name: 'Black Bag Odor Co.',
  shortName: 'Black Bag',
  /** Used as an order-number prefix, e.g. BB-7KQ2MX. Changing it only affects new orders. */
  orderPrefix: 'BB',
  tagline: 'Covert odor ops.',
  description:
    'Mini cornhole-style canvas bags packed with activated bamboo charcoal. Toss one in your sneakers, gym bag, locker, or car to trap funk without perfume — then toss it on your desk.',
  heroHeadline: 'Mini cornhole bags. Maximum odor ops.',
  heroSubhead:
    '4×4 canvas bags packed with activated bamboo charcoal. Drop one in your sneakers, gym bag, locker, or car. It traps funk — no perfume, no plug, no batteries. Off duty, it is the best desk toss you own.',
  motto: ['Deploy.', 'Neutralize.', 'Recharge.'],

  /** Legal operator shown in policies. Update when the NH LLC is filed (trigger: first $500 net profit). */
  legalName: 'Black Bag Odor Co. (operated by its founder as a sole proprietorship)',
  location: 'New Hampshire, USA',

  contact: {
    supportEmail: 'support@example.com',
    wholesaleEmail: 'wholesale@example.com',
    /** Typical reply window promised on the contact page. */
    responseTime: 'within 2 business days',
  },

  social: {
    instagram: 'https://www.instagram.com/',
    tiktok: 'https://www.tiktok.com/',
    handle: '@blackbagodor',
  },

  /** Founder's Pre-Order campaign banner on marketing pages. Per-SKU ship dates live in the admin. */
  preorderCampaign: {
    active: true,
    label: "Founder's Pre-Order",
    message: 'Batch 01 is hand-stitched in small runs. Reserve yours now — your order funds the first batch.',
  },

  /** Cloudflare Web Analytics beacon token (cookieless). Empty = analytics disabled. */
  analyticsToken: '',

  /** Product safety copy shown in the footer and on product pages. */
  safetyNote:
    'Not a children’s toy. Not for ages under 14. Keep away from small children and pets. Do not open or eat the charcoal.',
} as const;

export type SiteConfig = typeof site;
