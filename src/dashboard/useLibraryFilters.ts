import { useCallback, useDeferredValue, useMemo, useRef, useState } from 'react';
import { countKeywords, filterByKeywords, keywordKind, type KeywordCount, type KeywordIndex } from '../shared/keywords';
import { buildSearchIndex, filterItems, parseQuery, type SearchIndex } from '../shared/search';
import type { ItemType, SavedItem } from '../shared/types';

export type DateRange = 'any' | '7d' | '30d' | '1y';
export type TypeFilter = 'all' | ItemType;
/** `library` shows every item that is not forgotten. */
export type MarkFilter = 'library' | 'loved' | 'forgotten';

function filterByMark(items: readonly SavedItem[], mark: MarkFilter): SavedItem[] {
  if (mark === 'library') return items.filter((item) => item.mark !== 'forgotten');
  return items.filter((item) => item.mark === mark);
}

const RANGE_DAYS: Record<Exclude<DateRange, 'any'>, number> = { '7d': 7, '30d': 30, '1y': 365 };

function filterByDate(items: readonly SavedItem[], range: DateRange): SavedItem[] {
  if (range === 'any') return [...items];
  const since = new Date(Date.now() - RANGE_DAYS[range] * 86_400_000).toISOString();
  return items.filter((item) => item.timestamp >= since);
}

export interface LibraryFilters {
  query: string;
  setQuery: (query: string) => void;
  /** The query that the results reflect (lags `query` while typing). */
  deferredQuery: string;
  terms: string[];
  searchIndex: SearchIndex;

  keywords: ReadonlySet<string>;
  toggleKeyword: (key: string) => void;
  dateRange: DateRange;
  setDateRange: (range: DateRange) => void;
  type: TypeFilter;
  setType: (type: TypeFilter) => void;
  mark: MarkFilter;
  setMark: (mark: MarkFilter) => void;
  /** Number of active filters, not counting the search query. */
  activeCount: number;
  clearFilters: () => void;

  filtered: SavedItem[];
  /** Channel counts among items that match every filter except the channel one, so other channels stay visible. */
  channelFacets: KeywordCount[];
  /** Topic counts among the current results. */
  topicFacets: KeywordCount[];
}

/**
 * Search plus keyword, date, and type filters. Filters combine with AND; several selected channels
 * combine with OR (see `filterByKeywords`).
 */
export function useLibraryFilters(all: readonly SavedItem[], keywordIndex: KeywordIndex): LibraryFilters {
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [keywords, setKeywords] = useState<ReadonlySet<string>>(() => new Set());
  const [dateRange, setDateRange] = useState<DateRange>('any');
  const [type, setType] = useState<TypeFilter>('all');
  const [mark, setMark] = useState<MarkFilter>('library');
  const searchIndexRef = useRef<SearchIndex | undefined>(undefined);

  const searchIndex = useMemo(() => (searchIndexRef.current = buildSearchIndex(all, searchIndexRef.current)), [all]);
  const terms = useMemo(() => parseQuery(deferredQuery), [deferredQuery]);

  // Base: search + mark + date + type. Keyword filters and facets are computed on top of it.
  const base = useMemo(() => {
    let result = filterItems(all, searchIndex, terms);
    result = filterByMark(result, mark);
    result = filterByDate(result, dateRange);
    if (type !== 'all') result = result.filter((item) => item.type === type);
    return result;
  }, [all, searchIndex, terms, mark, dateRange, type]);

  const filtered = useMemo(() => filterByKeywords(base, keywordIndex, keywords), [base, keywordIndex, keywords]);

  const channelFacets = useMemo(() => {
    const topicsOnly = new Set([...keywords].filter((key) => keywordKind(key) === 'topic'));
    return countKeywords(filterByKeywords(base, keywordIndex, topicsOnly), keywordIndex, 'channel');
  }, [base, keywordIndex, keywords]);

  const topicFacets = useMemo(() => countKeywords(filtered, keywordIndex, 'topic'), [filtered, keywordIndex]);

  const toggleKeyword = useCallback((key: string) => {
    setKeywords((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const clearFilters = useCallback(() => {
    setKeywords(new Set());
    setDateRange('any');
    setType('all');
    setMark('library');
  }, []);

  const activeCount =
    keywords.size + (dateRange === 'any' ? 0 : 1) + (type === 'all' ? 0 : 1) + (mark === 'library' ? 0 : 1);

  return {
    query,
    setQuery,
    deferredQuery,
    terms,
    searchIndex,
    keywords,
    toggleKeyword,
    dateRange,
    setDateRange,
    type,
    setType,
    mark,
    setMark,
    activeCount,
    clearFilters,
    filtered,
    channelFacets,
    topicFacets,
  };
}
