import { Badge, Group, type MantineSize } from '@mantine/core';
import { IconUser } from '@tabler/icons-react';
import { memo, type ReactNode } from 'react';
import type { Keyword } from '../../shared/keywords';
import { findSentiment, SENTIMENT_CATEGORIES } from '../../shared/sentiment';
import { CATEGORY_ICONS, MOOD_COLORS } from './sentimentStyle';

interface KeywordBadgesProps {
  keywords: readonly Keyword[];
  active: ReadonlySet<string>;
  onToggle: (key: string) => void;
  size?: MantineSize;
  /** Shown in the same row, after the last keyword. */
  after?: ReactNode;
}

/** Clickable keyword pills, in the given order. Clicking one adds it to (or removes it from) the filters. */
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

/** Color, icon and hover text of a keyword, by its kind. */
function keywordLook(keyword: Keyword, iconSize: number): { color: string; icon?: ReactNode; kindName?: string } {
  if (keyword.kind === 'channel') return { color: 'red', icon: <IconUser size={iconSize} />, kindName: 'channel' };
  if (keyword.kind === 'sentiment') {
    const sentiment = findSentiment(keyword.label);
    if (!sentiment) return { color: 'grape', kindName: 'sentiment' };
    const CategoryIcon = CATEGORY_ICONS[sentiment.category];
    return {
      color: MOOD_COLORS[sentiment.mood],
      icon: <CategoryIcon size={iconSize} />,
      kindName: `${SENTIMENT_CATEGORIES[sentiment.category].name.toLowerCase()} sentiment`,
    };
  }
  return { color: 'navy' };
}

interface KeywordBadgeProps {
  keyword: Keyword;
  active: boolean;
  onToggle: (key: string) => void;
  size?: MantineSize;
  count?: number;
}

export function KeywordBadge({ keyword, active, onToggle, size = 'xs', count }: KeywordBadgeProps) {
  const { color, icon, kindName } = keywordLook(keyword, size === 'xs' ? 10 : 12);
  const name = kindName ? `${kindName} “${keyword.label}”` : `“${keyword.label}”`;
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
      color={color}
      leftSection={icon}
      data-kind={keyword.kind}
      rightSection={count !== undefined ? <span className="rt-keyword-count">{count}</span> : undefined}
      aria-pressed={active}
      title={active ? `Remove filter ${name}` : `Filter by ${name}`}
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
