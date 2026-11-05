/**
 * FAQ copy. Keep claims factual and conservative: activated charcoal ADSORBS odor molecules and
 * moisture. Do not claim it kills bacteria, purifies air for health, or is medical in any way.
 */
export interface FaqEntry {
  q: string;
  a: string[];
}

export const faq: FaqEntry[] = [
  {
    q: 'How does activated charcoal actually kill odor?',
    a: [
      'It doesn’t cover it up. It captures it. Activated bamboo charcoal is riddled with microscopic pores, giving a small handful of it a huge amount of internal surface area. Odor molecules and excess moisture stick to that surface (a process called adsorption) and stay put.',
      'No perfumes, no sprays, nothing plugged in. That means no “fresh linen” smell layered on top of sneaker funk.',
    ],
  },
  {
    q: 'How do I recharge it?',
    a: [
      'Once a month, leave the bag in direct sunlight for 1–2 hours, flipping it halfway through. UV and heat help release what the charcoal has trapped so it can get back to work.',
      'A sunny windowsill works. Keep it dry: don’t wash it, soak it, or put it in the dryer.',
    ],
  },
  {
    q: 'How long does one bag last?',
    a: [
      'With monthly sun recharges, up to two years of regular use. When it stops keeping up, cut it open and sprinkle the charcoal into garden soil. It’s just bamboo charcoal.',
    ],
  },
  {
    q: 'Where should I put it?',
    a: [
      'Inside a sneaker or cleat overnight, in a gym bag, hockey or lacrosse bag, locker, car, closet, or dorm-room trash corner. A 4×4 bag handles a shoe, a bag, or a small enclosed space; use a pair for both shoes or bigger spaces.',
    ],
  },
  {
    q: 'Is it actually a cornhole bag? Can I toss it?',
    a: [
      'It’s a mini cornhole-style bag: same square pillow shape and canvas, shrunk to 4×4. Toss it into a cup on your desk, across the locker room, at your roommate. Desk cornhole is a legitimate sport now.',
      'It’s built tough, but it’s an odor bag first. Don’t toss it at faces, windows, or anything fragile.',
    ],
  },
  {
    q: 'Is it safe around kids and pets?',
    a: [
      'Charcoal isn’t toxic, but the bag isn’t a children’s toy and isn’t meant for ages under 14. Keep it away from small children and pets that might chew it open.',
    ],
  },
  {
    q: 'What is a Founder’s Pre-Order?',
    a: [
      'We hand-stitch bags in small batches. When a colorway is on pre-order, you pay at checkout and we ship by the date shown on the product page and in your receipt. Pre-orders fund each batch’s materials, which keeps prices low.',
      'If we can’t ship by that date, we’ll email you with a new date and the option to cancel for a full refund. Changed your mind before it ships? Contact us and we’ll refund you in full.',
    ],
  },
  {
    q: 'Do you ship outside the US?',
    a: ['Not yet. US addresses only for now. Shipping is a flat $4, and free on orders of $30 or more.'],
  },
  {
    q: 'Can I get custom colors or a team logo?',
    a: [
      'Yes. Team, club, and event orders of 10+ bags get automatic bulk pricing, and custom colors or logos are quoted case by case. Use the bulk quote form.',
    ],
  },
];
