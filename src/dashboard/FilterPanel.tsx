import { Anchor, Group, Pill, SegmentedControl, Select, Stack, Text } from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import type { Keyword, KeywordCount, KeywordIndex } from '../shared/keywords';
import type { ItemType } from '../shared/types';
import { KeywordBadge } from './KeywordBadges';
import type { DateRange, LibraryFilters, MarkFilter, TypeFilter } from './useLibraryFilters';

const DATE_OPTIONS: { value: DateRange; label: string }[] = [
  { value: 'any', label: 'Any time' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '1y', label: 'Year' },
];

const TYPE_OPTIONS: { value: TypeFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'youtube_transcript', label: 'YouTube' },
  { value: 'webpage_text', label: 'Web pages' },
];

const MARK_OPTIONS: { value: MarkFilter; label: string }[] = [
  { value: 'library', label: 'Library' },
  { value: 'loved', label: 'Loved' },
  { value: 'forgotten', label: 'Forgotten' },
];

const CHANNELS_COLLAPSED = 6;
const TOPICS_COLLAPSED = 14;
const TOPICS_EXPANDED = 40;

interface FilterPanelProps {
  filters: LibraryFilters;
  /** Item types present in the library. The type filter is shown only when there are several. */
  types: readonly ItemType[];
  keywordsReady: boolean;
}

export function FilterPanel({ filters, types, keywordsReady }: FilterPanelProps) {
  const { channelFacets, topicFacets, keywords, toggleKeyword } = filters;

  // Selected topics that no longer occur in the results stay visible, so they can be removed.
  const topics = useMemo(() => withSelected(topicFacets, keywords, 'topic:'), [topicFacets, keywords]);

  return (
    <Stack gap="sm" className="rt-filters">
      {filters.activeCount > 0 && (
        <Group justify="space-between">
          <Text size="xs" c="dimmed">
            {filters.activeCount} {filters.activeCount === 1 ? 'filter' : 'filters'} active
          </Text>
          <Anchor component="button" type="button" size="xs" onClick={filters.clearFilters}>
            Clear filters
          </Anchor>
        </Group>
      )}

      <FilterSection label="Show">
        <SegmentedControl
          size="xs"
          fullWidth
          data={MARK_OPTIONS}
          value={filters.mark}
          onChange={(value) => filters.setMark(value as MarkFilter)}
        />
      </FilterSection>

      <FilterSection label="Saved">
        <SegmentedControl
          size="xs"
          fullWidth
          data={DATE_OPTIONS}
          value={filters.dateRange}
          onChange={(value) => filters.setDateRange(value as DateRange)}
        />
      </FilterSection>

      {types.length > 1 && (
        <FilterSection label="Type">
          <SegmentedControl
            size="xs"
            fullWidth
            data={TYPE_OPTIONS}
            value={filters.type}
            onChange={(value) => filters.setType(value as TypeFilter)}
          />
        </FilterSection>
      )}

      {channelFacets.length > 0 && (
        <FacetSection
          label="Channels"
          hint="any of"
          facets={withSelected(channelFacets, keywords, 'channel:')}
          active={keywords}
          onToggle={toggleKeyword}
          collapsed={CHANNELS_COLLAPSED}
          expanded={Infinity}
        />
      )}

      <FacetSection
        label="Topics"
        hint="all of"
        facets={topics}
        active={keywords}
        onToggle={toggleKeyword}
        collapsed={TOPICS_COLLAPSED}
        expanded={TOPICS_EXPANDED}
        empty={keywordsReady ? 'No topics in these results.' : 'Extracting keywords…'}
        finder={<TopicFinder facets={topicFacets} active={keywords} onPick={toggleKeyword} />}
      />
    </Stack>
  );
}

/** Compact, removable list of the active filters. Shown when the filter panel is collapsed. */
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
  return (
    <Group gap={4} className="rt-active-filters">
      {mark !== 'library' && (
        <Pill size="sm" withRemoveButton onRemove={() => filters.setMark('library')}>
          {MARK_OPTIONS.find((o) => o.value === mark)?.label}
        </Pill>
      )}
      {dateRange !== 'any' && (
        <Pill size="sm" withRemoveButton onRemove={() => filters.setDateRange('any')}>
          Saved: {DATE_OPTIONS.find((o) => o.value === dateRange)?.label}
        </Pill>
      )}
      {type !== 'all' && (
        <Pill size="sm" withRemoveButton onRemove={() => filters.setType('all')}>
          {TYPE_OPTIONS.find((o) => o.value === type)?.label}
        </Pill>
      )}
      {[...keywords].map((key) => {
        const keyword = labels.get(key);
        return (
          <Pill key={key} size="sm" withRemoveButton onRemove={() => filters.toggleKeyword(key)}>
            {keyword?.kind === 'channel' ? '@ ' : '# '}
            {keyword?.label ?? key.slice(key.indexOf(':') + 1)}
          </Pill>
        );
      })}
      <Anchor component="button" type="button" size="xs" ml={4} onClick={filters.clearFilters}>
        Clear
      </Anchor>
    </Group>
  );
}

/** Adds selected keys that are missing from `facets` (count 0), so every active filter has a pill. */
function withSelected(facets: KeywordCount[], selected: ReadonlySet<string>, prefix: string): KeywordCount[] {
  const present = new Set(facets.map((f) => f.keyword.key));
  const missing: KeywordCount[] = [];
  for (const key of selected) {
    if (!key.startsWith(prefix) || present.has(key)) continue;
    const label = key.slice(prefix.length);
    missing.push({ keyword: { key, kind: prefix === 'channel:' ? 'channel' : 'topic', label }, count: 0 });
  }
  // Selected first, so they never fall below the "show more" cut.
  const all = [...missing, ...facets];
  return [...all.filter((f) => selected.has(f.keyword.key)), ...all.filter((f) => !selected.has(f.keyword.key))];
}

function FilterSection({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <Group gap={6} mb={6}>
        <Text size="xs" fw={600} c="dimmed" tt="uppercase" lts={0.4}>
          {label}
        </Text>
        {hint && (
          <Text size="xs" c="dimmed">
            ({hint})
          </Text>
        )}
      </Group>
      {children}
    </div>
  );
}

interface FacetSectionProps {
  label: string;
  hint: string;
  facets: KeywordCount[];
  active: ReadonlySet<string>;
  onToggle: (key: string) => void;
  collapsed: number;
  expanded: number;
  empty?: string;
  finder?: React.ReactNode;
}

function FacetSection({
  label,
  hint,
  facets,
  active,
  onToggle,
  collapsed,
  expanded,
  empty,
  finder,
}: FacetSectionProps) {
  const [showAll, setShowAll] = useState(false);
  const limit = showAll ? expanded : collapsed;
  const visible = facets.slice(0, limit);
  const hidden = Math.min(facets.length, expanded) - visible.length;

  return (
    <FilterSection label={label} hint={hint}>
      {facets.length === 0 ? (
        <Text size="xs" c="dimmed">
          {empty}
        </Text>
      ) : (
        <Group gap={5}>
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
        </Group>
      )}
      {finder && facets.length > collapsed && <div style={{ marginTop: 8 }}>{finder}</div>}
    </FilterSection>
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
