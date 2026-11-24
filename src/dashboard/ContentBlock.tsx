import { Badge, Collapse, Group, Paper, Text, UnstyledButton } from '@mantine/core';
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
  /** Adds a copy button right after the title. */
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
    <Paper
      withBorder
      radius="md"
      component="section"
      className="rt-block"
      id={id}
      data-expanded={expanded || undefined}
    >
      <Group gap="xs" wrap="nowrap" className="rt-block-header">
        <UnstyledButton
          className="rt-block-toggle rt-block-toggle-title"
          onClick={toggle}
          aria-expanded={expanded}
          aria-controls={bodyId}
        >
          <Group gap={10} wrap="nowrap">
            <span className="rt-block-icon">{icon}</span>
            <Text fw={600} size="sm">
              {title}
            </Text>
            {count !== undefined && (
              <Badge size="sm" variant="light" color="gray" radius="sm">
                {count}
              </Badge>
            )}
          </Group>
        </UnstyledButton>
        {copy && <CopyAction value={copy.value} label={copy.label} />}
        {/* Fills the rest of the row so the whole header toggles; the title button is the accessible one. */}
        <UnstyledButton className="rt-block-toggle rt-block-toggle-rest" onClick={toggle} tabIndex={-1} aria-hidden>
          <IconChevronDown size={16} className="rt-block-chevron" />
        </UnstyledButton>
        {actions && (
          <Group gap={4} wrap="nowrap" pr={8}>
            {actions}
          </Group>
        )}
      </Group>
      <Collapse expanded={expanded} id={bodyId}>
        <div className={flush ? 'rt-block-body rt-block-body-flush' : 'rt-block-body'}>{children}</div>
      </Collapse>
    </Paper>
  );
}
