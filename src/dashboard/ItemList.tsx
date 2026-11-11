import { Checkbox, Group, Highlight, Text } from '@mantine/core';
import { IconBrandYoutube, IconEyeOff, IconFileText, IconHeartFilled } from '@tabler/icons-react';
import { memo, useMemo } from 'react';
import { displayKeywords, type Keyword, type KeywordIndex } from '../shared/keywords';
import { getIndexEntry, makeSnippet, type SearchIndex } from '../shared/search';
import type { SavedItem } from '../shared/types';
import { formatShortDate } from '../ui/format';
import { KeywordBadges } from './KeywordBadges';

/** Keywords shown per row. The channel, when known, is always the first one. */
const LIST_KEYWORDS = 5;

const NO_KEYWORDS: Keyword[] = [];

interface ItemListProps {
  items: readonly SavedItem[];
  searchIndex: SearchIndex;
  keywordIndex: KeywordIndex;
  terms: readonly string[];
  activeKeywords: ReadonlySet<string>;
  selectedId: string | undefined;
  checked: ReadonlySet<string>;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  onToggleKeyword: (key: string) => void;
}

export function ItemList({
  items,
  searchIndex,
  keywordIndex,
  terms,
  activeKeywords,
  selectedId,
  checked,
  onSelect,
  onToggle,
  onToggleKeyword,
}: ItemListProps) {
  return (
    <div role="listbox" aria-label="Saved items">
      {items.map((item) => (
        <ItemRow
          key={item.id}
          item={item}
          keywords={keywordIndex.get(item.id) ?? NO_KEYWORDS}
          // While searching, show where the match is. Otherwise the keywords say what the item is about.
          snippet={terms.length > 0 ? makeSnippet(item.content, terms, 70, getIndexEntry(searchIndex, item)) : ''}
          terms={terms}
          activeKeywords={activeKeywords}
          selected={item.id === selectedId}
          checked={checked.has(item.id)}
          onSelect={onSelect}
          onToggle={onToggle}
          onToggleKeyword={onToggleKeyword}
        />
      ))}
    </div>
  );
}

interface ItemRowProps {
  item: SavedItem;
  keywords: readonly Keyword[];
  snippet: string;
  terms: readonly string[];
  activeKeywords: ReadonlySet<string>;
  selected: boolean;
  checked: boolean;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  onToggleKeyword: (key: string) => void;
}

const ItemRow = memo(function ItemRow({
  item,
  keywords,
  snippet,
  terms,
  activeKeywords,
  selected,
  checked,
  onSelect,
  onToggle,
  onToggleKeyword,
}: ItemRowProps) {
  const highlight = terms as string[];
  const thumbnail = item.meta?.thumbnail;
  const shown = useMemo(() => displayKeywords(keywords, activeKeywords, LIST_KEYWORDS), [keywords, activeKeywords]);
  return (
    <div
      role="option"
      aria-selected={selected}
      tabIndex={-1}
      data-item-id={item.id}
      className="rt-item"
      data-selected={selected || undefined}
      onClick={() => onSelect(item.id)}
    >
      <Checkbox
        size="xs"
        mt={3}
        checked={checked}
        aria-label={`Select ${item.title}`}
        onClick={(event) => event.stopPropagation()}
        onChange={() => onToggle(item.id)}
      />
      {thumbnail && (
        <img
          className="rt-item-thumb"
          src={thumbnail}
          alt=""
          draggable={false}
        />
      )}
      <div style={{ minWidth: 0, flex: 1 }}>
        <Highlight highlight={highlight} size="sm" fw={600} lineClamp={2} lh={1.35}>
          {item.title || 'Untitled'}
        </Highlight>
        <Group gap={6} mt={4} wrap="nowrap">
          {item.type === 'youtube_transcript' ? (
            <IconBrandYoutube size={14} color="var(--mantine-color-red-6)" style={{ flexShrink: 0 }} />
          ) : (
            <IconFileText size={14} style={{ flexShrink: 0 }} />
          )}
          <Text size="xs" c="dimmed" truncate>
            {formatShortDate(item.timestamp)}
          </Text>
          {item.mark === 'loved' && (
            <IconHeartFilled
              size={13}
              color="var(--mantine-color-pink-6)"
              aria-label="Loved"
              style={{ flexShrink: 0 }}
            />
          )}
          {item.mark === 'forgotten' && <IconEyeOff size={13} aria-label="Forgotten" style={{ flexShrink: 0 }} />}
        </Group>
        {shown.length > 0 && (
          <div style={{ marginTop: 6 }}>
            <KeywordBadges keywords={shown} active={activeKeywords} onToggle={onToggleKeyword} />
          </div>
        )}
        {snippet && (
          <Highlight highlight={highlight} size="xs" c="dimmed" lineClamp={2} mt={6} lh={1.45}>
            {snippet}
          </Highlight>
        )}
      </div>
    </div>
  );
});
