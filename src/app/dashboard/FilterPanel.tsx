import { Anchor, Button, Select, Text } from '@mantine/core';
import { IconChevronDown, IconSearch } from '@tabler/icons-react';
import { useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import {
  keywordKind,
  type Keyword,
  type KeywordCount,
  type KeywordIndex,
  type KeywordKind,
} from '../../shared/keywords';
import type { ItemType } from '../../shared/types';
import { Chip } from '../ui/Chip';
import { KeywordBadge } from './KeywordBadges';
import type { DateRange, LibraryFilters, MarkFilter, TypeFilter } from './useLibraryFilters';

const DATE_OPTIONS: { value: DateRange; label: string }[] = [
  { value: 'any', label: 'Any' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '1y', label: 'Year' },
];

const TYPE_OPTIONS: { value: TypeFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'youtube_transcript', label: 'YouTube' },
  { value: 'webpage_text', label: 'Web pages' },
];

const MARK_LABELS: Record<MarkFilter, string> = { library: 'Library', loved: 'Loved', forgotten: 'Forgotten' };

const CHANNELS_COLLAPSED = 6;
const SENTIMENTS_COLLAPSED = 8;
const TOPICS_COLLAPSED = 14;
const TOPICS_EXPANDED = 40;

interface FilterPanelProps {
  filters: LibraryFilters;
  /** Item types present in the library. The type filter is shown only when there are several. */
  types: readonly ItemType[];
  keywordsReady: boolean;
}

export function FilterPanel({ filters, types, keywordsReady }: FilterPanelProps) {
  const { channelFacets, sentimentFacets, topicFacets, keywords, toggleKeyword } = filters;

  // Selected keywords that no longer occur in the results stay visible, so they can be removed.
  const channels = useMemo(() => withSelected(channelFacets, keywords, 'channel'), [channelFacets, keywords]);
  const sentiments = useMemo(() => withSelected(sentimentFacets, keywords, 'sentiment'), [sentimentFacets, keywords]);
  const topics = useMemo(() => withSelected(topicFacets, keywords, 'topic'), [topicFacets, keywords]);
  const selectedOf = (kind: KeywordKind) => [...keywords].filter((key) => keywordKind(key) === kind).length;

  return (
    <div className="rt-fpanel">
      <FilterGroup title="Saved" selected={filters.dateRange === 'any' ? 0 : 1}>
        <Segments options={DATE_OPTIONS} value={filters.dateRange} onChange={filters.setDateRange} label="Saved" />
      </FilterGroup>

      {sentiments.length > 0 && (
        <FacetGroup
          title="Sentiment"
          hint="any of"
          selected={selectedOf('sentiment')}
          facets={sentiments}
          active={keywords}
          onToggle={toggleKeyword}
          collapsed={SENTIMENTS_COLLAPSED}
          expanded={Infinity}
        />
      )}

      {channels.length > 0 && (
        <FacetGroup
          title="Channels"
          hint="any of"
          selected={selectedOf('channel')}
          facets={channels}
          active={keywords}
          onToggle={toggleKeyword}
          collapsed={CHANNELS_COLLAPSED}
          expanded={Infinity}
        />
      )}

      <FacetGroup
        title="Topics"
        hint="all of"
        selected={selectedOf('topic')}
        facets={topics}
        active={keywords}
        onToggle={toggleKeyword}
        collapsed={TOPICS_COLLAPSED}
        expanded={TOPICS_EXPANDED}
        empty={keywordsReady ? 'No topics in these results.' : 'Extracting keywords…'}
        finder={<TopicFinder facets={topicFacets} active={keywords} onPick={toggleKeyword} />}
      />

      {types.length > 1 && (
        <FilterGroup title="Type" selected={filters.type === 'all' ? 0 : 1} defaultCollapsed>
          <Segments options={TYPE_OPTIONS} value={filters.type} onChange={filters.setType} label="Type" />
        </FilterGroup>
      )}

      <div className="rt-fpanel-foot">
        <span className="rt-meta">
          Press <kbd className="mantine-Kbd-root">F</kbd> to open or close
        </span>
      </div>
    </div>
  );
}

/** A filter group: a title row that folds the group, and the content. */
function FilterGroup({
  title,
  hint,
  selected,
  defaultCollapsed = false,
  children,
}: {
  title: string;
  hint?: string;
  selected: number;
  defaultCollapsed?: boolean;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const toggle = () => setCollapsed((value) => !value);
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggle();
    }
  };
  return (
    <div className="rt-fgroup" data-collapsed={collapsed || undefined}>
      <h6 role="button" tabIndex={0} aria-expanded={!collapsed} onClick={toggle} onKeyDown={onKeyDown}>
        <span>
          {title}
          {hint && <small>{hint}</small>}
        </span>
        <span className="rt-r">
          {selected > 0 && `${selected} selected`}
          <IconChevronDown size={14} className="rt-chev" />
        </span>
      </h6>
      {children}
    </div>
  );
}

function Segments<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div className="rt-seg" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          data-active={option.value === value || undefined}
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** The active filters, as removable chips. Always shown while something is filtered. */
export function ActiveFilters({ filters, keywordIndex }: { filters: LibraryFilters; keywordIndex: KeywordIndex }) {
  const { keywords, dateRange, type, mark, activeCount } = filters;
  const labels = useMemo(() => {
    const found = new Map<string, Keyword>();
    if (keywords.size === 0) return found;
    for (const list of keywordIndex.values()) {
      for (const keyword of list) if (keywords.has(keyword.key)) found.set(keyword.key, keyword);
      if (found.size === keywords.size) break;
    }
    return found;
  }, [keywords, keywordIndex]);

  if (activeCount === 0) return null;

  const plainChip = (label: string, onRemove: () => void) => (
    <Chip
      key={label}
      color="gray"
      active
      trailing="×"
      title={`Remove filter ${label}`}
      aria-label={`Remove filter ${label}`}
      onClick={onRemove}
    >
      {label}
    </Chip>
  );

  return (
    <div className="rt-active">
      <div className="rt-active-head">
        <span className="rt-label">Active</span>
        <Button size="xs" variant="subtle" onClick={filters.clearFilters}>
          Clear all
        </Button>
      </div>
      <div className="rt-chips">
        {mark !== 'library' && plainChip(MARK_LABELS[mark], () => filters.setMark('library'))}
        {dateRange !== 'any' &&
          plainChip(DATE_OPTIONS.find((o) => o.value === dateRange)?.label ?? dateRange, () =>
            filters.setDateRange('any'),
          )}
        {type !== 'all' &&
          plainChip(TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type, () => filters.setType('all'))}
        {[...keywords].map((key) => (
          <KeywordBadge
            key={key}
            keyword={labels.get(key) ?? { key, kind: keywordKind(key), label: key.slice(key.indexOf(':') + 1) }}
            active
            removable
            onToggle={filters.toggleKeyword}
            size="sm"
          />
        ))}
      </div>
    </div>
  );
}

/** Adds selected keys of `kind` that are missing from `facets` (count 0), so every active filter has a pill. */
function withSelected(facets: KeywordCount[], selected: ReadonlySet<string>, kind: KeywordKind): KeywordCount[] {
  const present = new Set(facets.map((f) => f.keyword.key));
  const missing: KeywordCount[] = [];
  for (const key of selected) {
    if (keywordKind(key) !== kind || present.has(key)) continue;
    missing.push({ keyword: { key, kind, label: key.slice(kind.length + 1) }, count: 0 });
  }
  // Selected first, so they never fall below the "show more" cut.
  const all = [...missing, ...facets];
  return [...all.filter((f) => selected.has(f.keyword.key)), ...all.filter((f) => !selected.has(f.keyword.key))];
}

interface FacetGroupProps {
  title: string;
  hint: string;
  selected: number;
  facets: KeywordCount[];
  active: ReadonlySet<string>;
  onToggle: (key: string) => void;
  collapsed: number;
  expanded: number;
  empty?: string;
  finder?: ReactNode;
}

function FacetGroup({
  title,
  hint,
  selected,
  facets,
  active,
  onToggle,
  collapsed,
  expanded,
  empty,
  finder,
}: FacetGroupProps) {
  const [showAll, setShowAll] = useState(false);
  const limit = showAll ? expanded : collapsed;
  const visible = facets.slice(0, limit);
  const hidden = Math.min(facets.length, expanded) - visible.length;

  return (
    <FilterGroup title={title} hint={hint} selected={selected}>
      {finder && facets.length > collapsed && finder}
      {facets.length === 0 ? (
        <Text size="xs" c="dimmed">
          {empty}
        </Text>
      ) : (
        <div className="rt-chips">
          {visible.map(({ keyword, count }) => (
            <KeywordBadge
              key={keyword.key}
              keyword={keyword}
              count={count}
              active={active.has(keyword.key)}
              onToggle={onToggle}
              size="sm"
            />
          ))}
          {(hidden > 0 || showAll) && facets.length > collapsed && (
            <Anchor component="button" type="button" size="xs" onClick={() => setShowAll((v) => !v)}>
              {showAll ? 'Show less' : `+${hidden} more`}
            </Anchor>
          )}
        </div>
      )}
    </FilterGroup>
  );
}

/** Search box for topics beyond the visible pills. */
function TopicFinder({
  facets,
  active,
  onPick,
}: {
  facets: KeywordCount[];
  active: ReadonlySet<string>;
  onPick: (key: string) => void;
}) {
  const data = useMemo(
    () =>
      facets
        .filter((f) => !active.has(f.keyword.key))
        .map((f) => ({ value: f.keyword.key, label: `${f.keyword.label} (${f.count})` })),
    [facets, active],
  );
  const [search, setSearch] = useState('');
  return (
    <Select
      size="xs"
      searchable
      searchValue={search}
      onSearchChange={setSearch}
      clearable={false}
      value={null}
      data={data}
      limit={50}
      placeholder={`Find a topic among ${data.length}…`}
      leftSection={<IconSearch size={14} />}
      nothingFoundMessage="No such topic"
      onChange={(value) => {
        if (value) onPick(value);
        setSearch('');
      }}
      aria-label="Find a topic"
      comboboxProps={{ withinPortal: true }}
    />
  );
}
