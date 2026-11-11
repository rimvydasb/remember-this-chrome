import { Checkbox, Group, Highlight, Text } from '@mantine/core';
import { IconBrandYoutube, IconFileText } from '@tabler/icons-react';
import { memo } from 'react';
import { getIndexEntry, makeSnippet, type SearchIndex } from '../shared/search';
import type { SavedItem } from '../shared/types';
import { formatShortDate } from '../ui/format';

interface ItemListProps {
  items: readonly SavedItem[];
  index: SearchIndex;
  terms: readonly string[];
  selectedId: string | undefined;
  checked: ReadonlySet<string>;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
}

export function ItemList({ items, index, terms, selectedId, checked, onSelect, onToggle }: ItemListProps) {
  return (
    <div role="listbox" aria-label="Saved items">
      {items.map((item) => (
        <ItemRow
          key={item.id}
          item={item}
          snippet={makeSnippet(item.content, terms, 70, getIndexEntry(index, item))}
          terms={terms}
          selected={item.id === selectedId}
          checked={checked.has(item.id)}
          onSelect={onSelect}
          onToggle={onToggle}
        />
      ))}
    </div>
  );
}

interface ItemRowProps {
  item: SavedItem;
  snippet: string;
  terms: readonly string[];
  selected: boolean;
  checked: boolean;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
}

const ItemRow = memo(function ItemRow({ item, snippet, terms, selected, checked, onSelect, onToggle }: ItemRowProps) {
  const highlight = terms as string[];
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
            {item.meta?.channel ? `${item.meta.channel} · ` : ''}
            {formatShortDate(item.timestamp)}
          </Text>
        </Group>
        <Highlight highlight={highlight} size="xs" c="dimmed" lineClamp={2} mt={4} lh={1.45}>
          {snippet}
        </Highlight>
      </div>
    </div>
  );
});
