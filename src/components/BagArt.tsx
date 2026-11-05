/**
 * SVG product art for a mini cornhole-style bag in any colorway. Used until real product photos exist
 * (see PLAN.md). Rendered server-side by Astro and inside React islands — no inline styles (CSP).
 */
import { useId } from 'react';
import { colorways as palette, type ColorwayId } from '@/config/catalog';

interface BagArtProps {
  colorways: readonly ColorwayId[];
  className?: string;
  /** Accessible label; omit when the art is decorative next to a visible name. */
  title?: string;
}

const PILLOW = 'M14 18 Q60 8 106 18 Q114 60 106 102 Q60 112 14 102 Q6 60 14 18 Z';
const STITCH = 'M23 26 Q60 18 97 26 Q104 60 97 94 Q60 102 23 94 Q16 60 23 26 Z';

function Bag({
  colorway,
  gradientId,
  transform,
}: {
  colorway: ColorwayId;
  gradientId: string;
  transform?: string;
}) {
  const c = palette[colorway];
  return (
    <g transform={transform}>
      <ellipse cx="60" cy="112" rx="44" ry="5" fill="#000" opacity="0.35" />
      <path d={PILLOW} fill={c.canvas} />
      <path d={PILLOW} fill={`url(#${gradientId})`} />
      <path
        d={STITCH}
        fill="none"
        stroke={c.stitch}
        strokeWidth="2"
        strokeDasharray="5 4"
        strokeLinecap="round"
      />
      <circle cx="60" cy="60" r="15" fill="none" stroke={c.stitch} strokeWidth="2.5" />
      <path
        d="M60 39 V49 M60 71 V81 M39 60 H49 M71 60 H81"
        stroke={c.stitch}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <circle cx="60" cy="60" r="3" fill={c.stitch} />
    </g>
  );
}

export default function BagArt({ colorways, className, title }: BagArtProps) {
  const gradientId = `bag-shade-${useId().replace(/[^a-zA-Z0-9-]/g, '')}`;
  const pair = colorways.length > 1;
  const [first, second] = colorways;
  return (
    <svg
      viewBox={pair ? '-4 -8 186 146' : '0 0 120 124'}
      className={className}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <defs>
        <radialGradient id={gradientId} cx="40%" cy="35%" r="75%">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.14" />
          <stop offset="70%" stopColor="#000" stopOpacity="0" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.28" />
        </radialGradient>
      </defs>
      {pair && second ? (
        <>
          <Bag colorway={second} gradientId={gradientId} transform="translate(52 6) rotate(9 60 60)" />
          <Bag
            colorway={first ?? second}
            gradientId={gradientId}
            transform="translate(0 2) rotate(-6 60 60)"
          />
        </>
      ) : (
        first && <Bag colorway={first} gradientId={gradientId} />
      )}
    </svg>
  );
}
