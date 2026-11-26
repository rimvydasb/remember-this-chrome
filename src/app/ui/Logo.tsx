import { AppIcon } from './AppIcon';

export function Logo({ size = 'md' }: { size?: 'sm' | 'md' }) {
  return (
    <span className="rt-logo" data-size={size}>
      <AppIcon size={size === 'sm' ? 22 : 24} />
      <span className="rt-logo-text">Remember This</span>
    </span>
  );
}
