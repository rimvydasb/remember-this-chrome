import { Checkbox, Highlight } from '@mantine/core';
import { IconBrandYoutube, IconEyeOff, IconFileText, IconFolder, IconHeartFilled } from '@tabler/icons-react';
import { memo, useMemo, type DragEvent } from 'react';
import { displayKeywords, type Keyword, type KeywordIndex } from '../../shared/keywords';
import { getIndexEntry, makeSnippet, type SearchIndex } from '../../shared/search';
import type { SavedItem } from '../../shared/types';
import { formatDuration } from '../../shared/markdown';
import { formatShortDate } from '../ui/format';
import { KeywordBadges } from './KeywordBadges';

/** Topics shown per row; the channel and sentiments always show. */
const LIST_TOPICS = 4;

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
  /** Catalog name per item ID. Rows show it when given; leave out when the list shows one catalog. */
  catalogLabels?: ReadonlyMap<string, string>;
  onDragStart: (id: string, event: DragEvent) => void;
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
  catalogLabels,
  onDragStart,
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
          catalogLabel={catalogLabels?.get(item.id)}
          onDragStart={onDragStart}
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
  catalogLabel: string | undefined;
  onDragStart: (id: string, event: DragEvent) => void;
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
  catalogLabel,
  onDragStart,
}: ItemRowProps) {
  const highlight = terms as string[];
  const thumbnail = item.meta?.thumbnail;
  const shown = useMemo(() => displayKeywords(keywords, activeKeywords, LIST_TOPICS), [keywords, activeKeywords]);
  return (
    <div
      role="option"
      aria-selected={selected}
      tabIndex={-1}
      data-item-id={item.id}
      className="rt-item"
      data-selected={selected || undefined}
      onClick={() => onSelect(item.id)}
      draggable
      onDragStart={(event) => onDragStart(item.id, event)}
    >
      <Checkbox
        size="xs"
        checked={checked}
        aria-label={`Select ${item.title}`}
        onClick={(event) => event.stopPropagation()}
        onChange={() => onToggle(item.id)}
      />
      {thumbnail ? (
        <img className="rt-item-thumb" src={thumbnail} alt="" draggable={false} />
      ) : (
        <div className="rt-item-thumb" aria-hidden>
          {item.type === 'youtube_transcript' ? <IconBrandYoutube size={20} /> : <IconFileText size={20} />}
        </div>
      )}
      <div className="rt-item-body">
        <div>
          <Highlight highlight={highlight} className="rt-item-title" component="h4" inherit>
            {item.title || 'Untitled'}
          </Highlight>
          <div className="rt-item-meta">
            <span>
              {[item.meta?.durationSec ? formatDuration(item.meta.durationSec) : '', formatShortDate(item.timestamp)]
                .filter(Boolean)
                .join(' · ')}
            </span>
            {item.mark === 'loved' && <IconHeartFilled size={12} aria-label="Loved" style={{ color: 'var(--err)' }} />}
            {item.mark === 'forgotten' && <IconEyeOff size={12} aria-label="Forgotten" />}
            {catalogLabel && (
              <span title={`In ${catalogLabel}`}>
                <IconFolder size={12} style={{ verticalAlign: '-2px', marginRight: 4 }} />
                {catalogLabel}
              </span>
            )}
          </div>
        </div>
        {shown.length > 0 && <KeywordBadges keywords={shown} active={activeKeywords} onToggle={onToggleKeyword} />}
        {snippet && (
          <Highlight highlight={highlight} className="rt-item-excerpt" component="div" inherit>
            {snippet}
          </Highlight>
        )}
      </div>
    </div>
  );
});
