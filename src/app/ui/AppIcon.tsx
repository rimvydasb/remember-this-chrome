import { useId, type SVGProps } from 'react';

// The app icon (Graphite): indigo tile, white bookmark, the star cut out. Flat colors, rounded corners,
// a soft shadow under the bookmark at 48 px and up. The bookmark is relatively smaller at small sizes.
// Keep in sync with scripts/generate-icons.mjs, which renders the same design to the extension PNGs.
const TILE = '#5b67e0';
const MARK = '#ffffff';
const STAR = Array.from({ length: 10 }, (_, i) => {
  const radius = i % 2 === 0 ? 12.5 : 5.4;
  const angle = -Math.PI / 2 + (i * Math.PI) / 5;
  return `${(50 + radius * Math.cos(angle)).toFixed(2)},${(42 + radius * Math.sin(angle)).toFixed(2)}`;
}).join(' ');

export interface AppIconProps extends Omit<SVGProps<SVGSVGElement>, 'width' | 'height' | 'viewBox'> {
  /** Width and height in pixels. */
  size?: number;
}

function markScale(size: number): number {
  if (size >= 96) return 1;
  if (size >= 48) return 0.94;
  if (size >= 32) return 0.9;
  if (size >= 24) return 0.87;
  return 0.85;
}

export function AppIcon({ size = 32, ...props }: AppIconProps) {
  const id = useId();
  const k = markScale(size);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      aria-hidden="true"
      style={{ display: 'block', overflow: 'visible', flexShrink: 0 }}
      {...props}
    >
      {size >= 48 && (
        <defs>
          <filter id={`${id}-sh`} x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="3" stdDeviation="2.5" floodColor="#000" floodOpacity="0.28" />
          </filter>
        </defs>
      )}
      <rect x="2" y="2" width="96" height="96" rx="24" fill={TILE} />
      <g transform={`translate(50 50.5) scale(${k}) translate(-50 -50.5)`}>
        <polygon
          points="31,21 69,21 69,80 50,65 31,80"
          fill={MARK}
          stroke={MARK}
          strokeWidth="8"
          strokeLinejoin="round"
          filter={size >= 48 ? `url(#${id}-sh)` : undefined}
        />
        <polygon points={STAR} fill={TILE} stroke={TILE} strokeWidth="2.5" strokeLinejoin="round" />
      </g>
    </svg>
  );
}
