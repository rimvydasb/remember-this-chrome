import { useId, type SVGProps } from 'react';

// The app icon: navy square, silver bookmark, navy star.
// Keep in sync with scripts/generate-icons.mjs, which renders the same design to the extension PNGs.
const STAR = Array.from({ length: 10 }, (_, i) => {
  const radius = i % 2 === 0 ? 13.5 : 5.7;
  const angle = -Math.PI / 2 + (i * Math.PI) / 5;
  return `${(50 + radius * Math.cos(angle)).toFixed(2)},${(42.5 + radius * Math.sin(angle)).toFixed(2)}`;
}).join(' ');

export interface AppIconProps extends Omit<SVGProps<SVGSVGElement>, 'width' | 'height' | 'viewBox'> {
  /** Width and height in pixels. */
  size?: number;
}

export function AppIcon({ size = 32, ...props }: AppIconProps) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" {...props}>
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#102a5e" />
          <stop offset="1" stopColor="#0a193d" />
        </linearGradient>
        <linearGradient id={`${id}-silver`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ecf0f5" />
          <stop offset="1" stopColor="#a0aab8" />
        </linearGradient>
      </defs>
      <rect width="100" height="100" rx="8" fill={`url(#${id}-bg)`} />
      <polygon points="30,20 70,20 70,82 50,66 30,82" fill={`url(#${id}-silver)`} />
      <polygon points={STAR} fill="#0f2757" />
    </svg>
  );
}
