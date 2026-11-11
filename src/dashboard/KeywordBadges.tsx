import { Badge, Group, type MantineSize } from '@mantine/core';
import { IconUser } from '@tabler/icons-react';
import { memo, type ReactNode } from 'react';
import type { Keyword } from '../shared/keywords';

interface KeywordBadgesProps {
  keywords: readonly Keyword[];
  active: ReadonlySet<string>;
  onToggle: (key: string) => void;
  size?: MantineSize;
  /** Shown in the same row, after the last keyword. */
  after?: ReactNode;
}

/** Clickable keyword pills. Clicking one adds it to (or removes it from) the filters. */
export const KeywordBadges = memo(function KeywordBadges({
  keywords,
  active,
  onToggle,
  size = 'xs',
  after,
}: KeywordBadgesProps) {
  if (keywords.length === 0 && !after) return null;
  return (
    <Group gap={4}>
      {keywords.map((keyword) => (
        <KeywordBadge
          key={keyword.key}
          keyword={keyword}
          active={active.has(keyword.key)}
          onToggle={onToggle}
          size={size}
        />
      ))}
      {after}
    </Group>
  );
});

interface KeywordBadgeProps {
  keyword: Keyword;
  active: boolean;
  onToggle: (key: string) => void;
  size?: MantineSize;
  count?: number;
}

export function KeywordBadge({ keyword, active, onToggle, size = 'xs', count }: KeywordBadgeProps) {
  const isChannel = keyword.kind === 'channel';
  return (
    <Badge
      component="button"
      type="button"
      size={size}
      radius="sm"
      tt="none"
      fw={500}
      className="rt-keyword"
      variant={active ? 'filled' : 'light'}
      color={isChannel ? 'red' : 'indigo'}
      leftSection={isChannel ? <IconUser size={10} /> : undefined}
      rightSection={count !== undefined ? <span className="rt-keyword-count">{count}</span> : undefined}
      aria-pressed={active}
      title={active ? `Remove filter “${keyword.label}”` : `Filter by “${keyword.label}”`}
      onClick={(event: React.MouseEvent) => {
        event.stopPropagation();
        onToggle(keyword.key);
      }}
      maw="100%"
    >
      {keyword.label}
    </Badge>
  );
}
