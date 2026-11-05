# Launch & compliance checklist

> Practical reminders, not legal or tax advice. Confirm anything material with a professional.

## Before taking real money

- [ ] **Brand name:** USPTO trademark search (Classes 5, 21, 28) and domain/handle check, then lock
      the name (ADR 0010)
- [ ] Real support email and socials in `src/config/site.ts`. Remove the `example.com` placeholders.
- [ ] Batch 01 ship-by dates set in `/admin/inventory`, with dates you can actually hit
- [ ] Legal pages reviewed and edited: privacy, terms, shipping and returns (`src/pages/legal/`)
- [ ] Stripe account verified; business name, support email, and statement descriptor set; receipts on
- [ ] Deploy runbook done in test mode, then one live order placed and refunded
- [ ] **Product safety:** keep the 14+ / "not a children's toy" labeling on the product, packaging,
      and site. Marketing it as a toy for kids under 12 would make it a "children's product" under
      CPSIA (third-party testing and tracking labels). Don't.
- [ ] Packaging insert: recharge instructions, care ("keep dry"), safety line, and the field-report card
- [ ] Small-business insurance quote (general and product liability). Optional at first, smart before
      wholesale.

## Business structure and money

- [ ] Run as a sole proprietor until the **first $500 net profit** (the admin tracks an estimate).
      Then file the New Hampshire LLC (NH Secretary of State, QuickStart) and update
      `site.legalName`.
- [ ] Separate bank account for the business from day one. Point Stripe payouts there.
- [ ] Keep receipts for materials (COGS) and shipping labels.
- [ ] NH has no sales tax. Revisit if any state approaches economic-nexus thresholds (ADR 0014).
- [ ] Track income for federal self-employment tax and NH business taxes (check thresholds for the
      Business Profits and Business Enterprise taxes).

## Ongoing

- [ ] Ship by the promised date or notify and offer a refund (FTC Mail Order Rule)
- [ ] Never post fabricated reviews or testimonials (FTC). Repost real customer content with permission.
- [ ] Honor privacy requests within the response time on the privacy page
