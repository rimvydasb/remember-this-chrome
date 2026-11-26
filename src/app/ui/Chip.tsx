import type { ReactNode } from 'react';

/** The tag colors of the Graphite spec. Sentiment moods and keyword kinds map onto them. */
export type ChipColor = 'green' | 'lime' | 'gray' | 'yellow' | 'orange' | 'red' | 'navy' | 'grape';

interface ChipProps {
  color: ChipColor;
  /** A filled chip is an active filter. */
  active?: boolean;
  icon?: ReactNode;
  /** Shown after the label, in mono (a count, or ×). */
  trailing?: ReactNode;
  /** A clickable chip is a button. */
  onClick?: (event: React.MouseEvent) => void;
  className?: string;
  title?: string;
  children: ReactNode;
  'data-kind'?: string;
  'data-mood'?: string;
  'aria-pressed'?: boolean;
  'aria-label'?: string;
}

/** A tag chip: 20 px high, 4 px radius, tinted by its color, solid when active. */
export function Chip({ color, active, icon, trailing, onClick, className, children, ...rest }: ChipProps) {
  const classes = `rt-chip c-${color}${active ? ' on' : ''}${className ? ` ${className}` : ''}`;
  const content = (
    <>
      {icon}
      <span className="rt-chip-label">{children}</span>
      {trailing !== undefined && <em>{trailing}</em>}
    </>
  );
  if (onClick)
    return (
      <button type="button" className={classes} onClick={onClick} {...rest}>
        {content}
      </button>
    );
  return (
    <span className={classes} {...rest}>
      {content}
    </span>
  );
}
