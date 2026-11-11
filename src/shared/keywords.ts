import type { ItemTerms } from './terms';
import type { SavedItem } from './types';

/**
 * Keywords of the library. An item with LLM-generated tags (`aiTags`) uses those. Other items get
 * keywords from their extracted terms (see `terms.ts`), ranked by TF-IDF across the library, so
 * terms that appear in every item rank below the terms that make one item different from the others.
 */

export type KeywordKind = 'channel' | 'topic';

export interface Keyword {
  /** Stable filter key: `channel:<name>` or `topic:<word>`. */
  key: string;
  kind: KeywordKind;
  /** Display text. */
  label: string;
}

/** Number of keywords kept per item. The list shows the first few; filters use all of them. */
export const KEYWORDS_PER_ITEM = 10;

export const channelKey = (channel: string) => `channel:${channel.trim().toLowerCase()}`;
export const topicKey = (term: string) => `topic:${term}`;

/** Filter key text of a tag: "AI  Agents" and "ai agents" are the same topic. */
const tagKey = (tag: string) => tag.trim().replace(/\s+/g, ' ').toLowerCase();

/** True when the item's tags come from an LLM. Otherwise they come from keyword extraction. */
export const isAiGeneratedTags = (item: SavedItem): boolean => (item.aiTags?.tags.length ?? 0) > 0;

export type KeywordIndex = Map<string, Keyword[]>;
/** Extracted terms by `termCacheKey`. */
export type TermCache = Map<string, ItemTerms>;

/** Changes when an item changes, so its terms are extracted again. */
export const termCacheKey = (item: SavedItem) => `${item.id}\u0000${item.timestamp}`;

const NO_TERMS: ItemTerms = { terms: [], total: 0, acronyms: [] };

/**
 * Returns the keywords of every item, keyed by item ID. The channel is always the first keyword.
 * Items whose terms are not in `cache` yet get only their channel.
 */
export function buildKeywordIndex(items: readonly SavedItem[], cache: TermCache): KeywordIndex {
  // AI-tagged items do not take part in the TF-IDF ranking.
  const perItem = items.map((item) =>
    isAiGeneratedTags(item) ? NO_TERMS : (cache.get(termCacheKey(item)) ?? NO_TERMS),
  );

  const documentFrequency = new Map<string, number>();
  for (const { terms } of perItem) {
    for (const [term] of terms) documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
  }

  const n = perItem.filter((entry) => entry !== NO_TERMS).length;
  const index: KeywordIndex = new Map();
  items.forEach((item, i) => {
    const { terms, total, acronyms } = perItem[i]!;
    const capitals = new Set(acronyms);
    const channel = item.meta?.channel?.trim();
    const channelWords = new Set(channel ? channel.toLowerCase().split(/\s+/) : []);
    // Smoothed IDF: stays positive with one item, and still favors terms that few items share.
    const scored = terms
      .filter(([term]) => !channelWords.has(term))
      .map(([term, weight]) => ({
        term,
        score: (weight / Math.max(1, total)) * Math.log(1 + n / documentFrequency.get(term)!),
      }))
      .sort((a, b) => b.score - a.score);

    const keywords: Keyword[] = [];
    if (channel) keywords.push({ key: channelKey(channel), kind: 'channel', label: channel });
    if (isAiGeneratedTags(item)) {
      const seen = new Set<string>();
      for (const tag of item.aiTags!.tags) {
        const key = topicKey(tagKey(tag));
        if (seen.has(key) || keywords.length >= KEYWORDS_PER_ITEM) continue;
        seen.add(key);
        keywords.push({ key, kind: 'topic', label: tag.trim() });
      }
      index.set(item.id, keywords);
      return;
    }
    for (const { term } of scored) {
      if (keywords.length >= KEYWORDS_PER_ITEM) break;
      keywords.push({ key: topicKey(term), kind: 'topic', label: capitals.has(term) ? term.toUpperCase() : term });
    }
    index.set(item.id, keywords);
  });
  return index;
}

export interface KeywordCount {
  keyword: Keyword;
  count: number;
}

/** Counts how many of `items` have each keyword. Sorted by count, then label. */
export function countKeywords(items: readonly SavedItem[], index: KeywordIndex, kind?: KeywordKind): KeywordCount[] {
  const counts = new Map<string, KeywordCount>();
  for (const item of items) {
    for (const keyword of index.get(item.id) ?? []) {
      if (kind && keyword.kind !== kind) continue;
      const entry = counts.get(keyword.key);
      if (entry) entry.count++;
      else counts.set(keyword.key, { keyword, count: 1 });
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.keyword.label.localeCompare(b.keyword.label));
}

export const keywordKind = (key: string): KeywordKind => (key.startsWith('channel:') ? 'channel' : 'topic');

/**
 * Returns the items that match the keyword keys. An item matches when it is from **any** of the
 * selected channels and has **all** of the selected topics.
 */
export function filterByKeywords(
  items: readonly SavedItem[],
  index: KeywordIndex,
  keys: ReadonlySet<string>,
): SavedItem[] {
  if (keys.size === 0) return [...items];
  let channels = 0;
  for (const key of keys) if (keywordKind(key) === 'channel') channels++;
  const topics = keys.size - channels;
  return items.filter((item) => {
    const own = index.get(item.id);
    if (!own) return false;
    let channelFound = false;
    let topicsFound = 0;
    for (const keyword of own) {
      if (!keys.has(keyword.key)) continue;
      if (keyword.kind === 'channel') channelFound = true;
      else topicsFound++;
    }
    return (channels === 0 || channelFound) && topicsFound === topics;
  });
}

/** Orders an item's keywords for display: channel first, then active filters, then the rest by rank. */
export function displayKeywords(keywords: readonly Keyword[], active: ReadonlySet<string>, limit: number): Keyword[] {
  if (active.size === 0) return keywords.slice(0, limit);
  const channel = keywords.filter((k) => k.kind === 'channel');
  const topics = keywords.filter((k) => k.kind === 'topic');
  const ordered = [...channel, ...topics.filter((k) => active.has(k.key)), ...topics.filter((k) => !active.has(k.key))];
  return ordered.slice(0, limit);
}
