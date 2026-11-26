import { useInterval } from '@mantine/hooks';
import { useEffect, useState } from 'react';

/** "0:14" */
export function elapsed(from: number, now: number): string {
  const seconds = Math.max(0, Math.floor((now - from) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/**
 * A progress bar that never stands still. With `value` (0–1) the fill stops at that share and
 * shimmers; without it, a short fill slides across, for work of unknown length.
 */
export function ActivityBar({ value, small = false }: { value?: number; small?: boolean }) {
  const indeterminate = value === undefined;
  return (
    <span
      className="rt-bar"
      data-small={small || undefined}
      data-indeterminate={indeterminate || undefined}
      role="progressbar"
      aria-valuemin={indeterminate ? undefined : 0}
      aria-valuemax={indeterminate ? undefined : 100}
      aria-valuenow={indeterminate ? undefined : Math.round(value * 100)}
    >
      <i style={indeterminate ? undefined : { width: `${Math.max(6, Math.round(value * 100))}%` }} />
    </span>
  );
}

/** A live bar and the time since it appeared, for a block whose AI answer is on its way. */
export function GeneratingNote({ label = 'Generating' }: { label?: string }) {
  const [started] = useState(() => Date.now());
  const [now, setNow] = useState(started);
  const interval = useInterval(() => setNow(Date.now()), 1000);
  useEffect(() => {
    interval.start();
    return interval.stop;
    // Start once; `interval` is a new object on each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="rt-generating" role="status">
      <ActivityBar />
      <span className="rt-bmeta">
        {label} · {elapsed(started, now)}
      </span>
    </div>
  );
}
