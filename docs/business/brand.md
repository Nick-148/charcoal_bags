# Brand guide — Black Bag Odor Co. (provisional)

> The name is provisional (ADR 0010). Everything below except the name carries over to a rebrand.

## Positioning

**Odor control that doesn't look like odor control.** Mini cornhole-style canvas bags packed with
activated bamboo charcoal. They do real work in sneakers, gym bags, lockers, and cars, and look good
enough to live on a desk as a toss game. For college students, athletes, gym-goers, and tailgaters.

- **Versus sprays and plug-ins:** removes odor instead of masking it. No perfume, no outlet, no refills.
- **Versus mesh charcoal bags:** same science, but tough canvas, a giftable look, and a reason to leave it out.

## Name options considered (2026-11-04)

| Name                   | Tagline                     | Direction                                 |
| ---------------------- | --------------------------- | ----------------------------------------- |
| **Black Bag Odor Co.** | "Covert odor ops."          | Tactical minimalism (chosen, provisional) |
| Sack the Stink         | "Toss it in. Knock it out." | Game-day athletic, safety orange          |
| Funk Toss Co.          | "Toss the funk."            | Retro varsity, navy + gold                |
| Smell Ya Later         | "Funk out. Fun in."         | Sticker-pop, electric lime                |

Before printing anything, search USPTO trademarks (Class 5 deodorizers, Class 28 games, Class 21
household), check domain and social-handle availability, and do a quick web search for
confusingly similar brands.

## Voice: deadpan field manual

Short, dry, confident, a little absurd. It treats gym-bag funk like a classified threat.

- ✅ "Deploy. Neutralize. Recharge." · "Where funk goes to die." · "The locker that has seen things."
- ✅ Real facts in plain words: "activated bamboo charcoal", "1–2 hours of sun once a month".
- ❌ No health, antibacterial, air-purifying, or "toxin" claims. ❌ No fake reviews or stats.
- ❌ Not "for kids". The product is 14+ and not a children's toy.

## Visual system

| Token (src/styles/global.css) | Value     | Use                                |
| ----------------------------- | --------- | ---------------------------------- |
| `surface`                     | `#111111` | Page background (matte black)      |
| `surface-raised`              | `#1b1b1b` | Cards                              |
| `fg`                          | `#f2eee6` | Primary text (bone)                |
| `accent`                      | `#c8a97e` | Kraft: primary CTAs, highlights    |
| `secondary`                   | `#4b5320` | Olive drab: secondary CTA, banners |
| `warn`                        | `#e8b04a` | Recharge/sun indicator             |

- **Type:** Big Shoulders Stencil (display, uppercase), Inter (body), IBM Plex Mono (labels, prices).
- **Signature details:** dashed "stitching" borders (`stitch` utility), crosshair or target mark,
  spec-sheet tables, mission-code eyebrows ("Field manual", "Areas of operation").
- **Product colorways** (catalog data, not theme): Blackout, Olive Drab, Kraft, Bone.

## Rebranding checklist

Use the skill at `.claude/skills/rebrand/SKILL.md`. In short: edit `src/config/site.ts` and the
tokens in `src/styles/global.css`, review copy in `src/pages/*` and `src/content/faq.ts` for voice,
update the README title, then run `npm run verify && npm run test:e2e`.
