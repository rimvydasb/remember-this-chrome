import { Collapse, Group } from '@mantine/core';
import { useLocalStorage } from '@mantine/hooks';
import { IconChevronDown } from '@tabler/icons-react';
import { useId, type ReactNode } from 'react';
import { CopyAction } from './CopyAction';

interface ContentBlockProps {
  /** Stable key; the collapsed state is remembered per key across items and sessions. */
  storageKey: string;
  icon: ReactNode;
  title: string;
  count?: number;
  /** Adds a copy button to the right side of the header. */
  copy?: { value: string; label: string };
  /** Extra header content (buttons), shown on the right, outside the toggle. */
  actions?: ReactNode;
  defaultExpanded?: boolean;
  /** Removes the body padding, for edge-to-edge lists. */
  flush?: boolean;
  id?: string;
  children: ReactNode;
}

/** A bordered, collapsible section of the item view. */
export function ContentBlock({
  storageKey,
  icon,
  title,
  count,
  copy,
  actions,
  defaultExpanded = true,
  flush = false,
  id,
  children,
}: ContentBlockProps) {
  const [expanded, setExpanded] = useLocalStorage<boolean>({
    key: `rt-block-expanded:${storageKey}`,
    defaultValue: defaultExpanded,
    getInitialValueInEffect: false,
  });
  const bodyId = useId();
  const toggle = () => setExpanded((value) => !value);

  return (
    <section className="rt-block" id={id} data-expanded={expanded || undefined}>
      {/* The whole header toggles; the title button is the accessible control. */}
      <div className="rt-block-header" onClick={toggle}>
        <button
          type="button"
          className="rt-block-toggle"
          onClick={(event) => {
            event.stopPropagation();
            toggle();
          }}
          aria-expanded={expanded}
          aria-controls={bodyId}
        >
          <span className="rt-block-icon">{icon}</span>
          <span className="rt-block-title">{title}</span>
          {count !== undefined && <span className="rt-block-count">{count}</span>}
        </button>
        <Group gap={4} wrap="nowrap" className="rt-block-right" onClick={(event) => event.stopPropagation()}>
          {actions}
          {copy && <CopyAction value={copy.value} label={copy.label} />}
        </Group>
        <span className="rt-block-chevron" aria-hidden>
          <IconChevronDown size={16} />
        </span>
      </div>
      <Collapse expanded={expanded} id={bodyId}>
        <div className={flush ? 'rt-block-body rt-block-body-flush' : 'rt-block-body'}>{children}</div>
      </Collapse>
    </section>
  );
}
