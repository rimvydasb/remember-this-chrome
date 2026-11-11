import { Button } from '@mantine/core';
import { IconChevronDown, IconChevronUp } from '@tabler/icons-react';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/** Height (px) the text is limited to until the user asks for the full text. */
const CLAMP_HEIGHT = 360;

/**
 * Limits long text to a preview with a fade-out and a "Show full text" toggle.
 * `unclamped` shows the full text regardless (e.g. while search matches are highlighted).
 */
export function ClampedText({ unclamped = false, children }: { unclamped?: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);
  const [open, setOpen] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setOverflows(el.scrollHeight > CLAMP_HEIGHT + 80);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const clamped = overflows && !open && !unclamped;

  const collapse = () => {
    setOpen(false);
    // Keep the toggle in view after the text shrinks.
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  return (
    <div className="rt-clamp">
      <div
        ref={ref}
        className="rt-clamp-content"
        data-clamped={clamped || undefined}
        style={clamped ? { maxHeight: CLAMP_HEIGHT } : undefined}
      >
        {children}
      </div>
      {overflows && !unclamped && (
        <div className="rt-clamp-toggle">
          <Button
            size="xs"
            variant="default"
            radius="xl"
            rightSection={open ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
            onClick={open ? collapse : () => setOpen(true)}
          >
            {open ? 'Show less' : 'Show full text'}
          </Button>
        </div>
      )}
    </div>
  );
}
