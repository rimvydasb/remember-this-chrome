import { hasTopicTags } from './tags';
import type { ItemTerms } from './terms';
import type { SavedItem, TagKind } from './types';

/**
 * Keywords of the library: what the list, the reader and the filters show of an item, one facet
 * per kind. They come from three places:
 * - `channel`: the channel in `meta.channel`;
 * - `sentiment`: the stored sentiment tags;
 * - `topic`: the stored topic tags, or, for items without them, the extracted terms (see
 *   `terms.ts`) ranked by TF-IDF across the library, so terms that appear in every item rank
 *   below the terms that make one item different from the others.
 */

export type KeywordKind = 'channel' | TagKind;

export const KEYWORD_KINDS: readonly KeywordKind[] = ['channel', 'sentiment', 'topic'];

/**
 * How selected keywords of a kind combine. An item is from one channel and has one to three
 * sentiments, so selecting several of them means "any of". Topics narrow down: "all of".
 */
export const KIND_MATCH: Readonly<Record<KeywordKind, 'any' | 'all'>> = {
  channel: 'any',
  sentiment: 'any',
  topic: 'all',
};

export interface Keyword {
  /** Stable filter key: `<kind>:<normalized label>`. */
  key: string;
  kind: KeywordKind;
  /** Display text. */
  label: string;
}

/** Number of keywords kept per item. The list shows the first few; filters use all of them. */
export const KEYWORDS_PER_ITEM = 10;

/** The filter key of a label: "AI  Agents" and "ai agents" are the same topic. */
export const keywordKey = (kind: KeywordKind, label: string) =>
  `${kind}:${label.trim().replace(/\s+/g, ' ').toLowerCase()}`;

const keyword = (kind: KeywordKind, label: string): Keyword => ({ key: keywordKey(kind, label), kind, label });

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
  // Items with topic tags do not take part in the TF-IDF ranking.
  const perItem = items.map((item) => (hasTopicTags(item) ? NO_TERMS : (cache.get(termCacheKey(item)) ?? NO_TERMS)));

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

    // Channel, then sentiments, then topics. Channel and sentiments do not count toward the topic limit.
    const keywords: Keyword[] = [];
    if (channel) keywords.push(keyword('channel', channel));
    const topics: Keyword[] = [];
    for (const tag of item.tags ?? []) (tag.kind === 'topic' ? topics : keywords).push(keyword(tag.kind, tag.label));
    if (topics.length === 0) {
      for (const { term } of scored.slice(0, KEYWORDS_PER_ITEM)) {
        topics.push(keyword('topic', capitals.has(term) ? term.toUpperCase() : term));
      }
    }
    const seen = new Set<string>();
    const unique = (entry: Keyword) => !seen.has(entry.key) && Boolean(seen.add(entry.key));
    index.set(item.id, [...keywords.filter(unique), ...topics.filter(unique).slice(0, KEYWORDS_PER_ITEM)]);
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

export const keywordKind = (key: string): KeywordKind => {
  const kind = key.slice(0, key.indexOf(':')) as KeywordKind;
  return KEYWORD_KINDS.includes(kind) ? kind : 'topic';
};

/** The keys without those of `kind`. Facets of an "any of" kind count with this, so its other values stay visible. */
export function keysWithout(keys: ReadonlySet<string>, kind: KeywordKind): ReadonlySet<string> {
  return new Set([...keys].filter((key) => keywordKind(key) !== kind));
}

/**
 * Returns the items that match the keyword keys. Within a kind, keys combine by `KIND_MATCH`; the
 * kinds combine with AND. For example: from **any** of the selected channels, with **any** of the
 * selected sentiments, and with **all** of the selected topics.
 */
export function filterByKeywords(
  items: readonly SavedItem[],
  index: KeywordIndex,
  keys: ReadonlySet<string>,
): SavedItem[] {
  if (keys.size === 0) return [...items];
  const wanted = new Map<KeywordKind, number>();
  for (const key of keys) {
    const kind = keywordKind(key);
    wanted.set(kind, (wanted.get(kind) ?? 0) + 1);
  }
  return items.filter((item) => {
    const own = index.get(item.id);
    if (!own) return false;
    const found = new Map<KeywordKind, number>();
    for (const { key, kind } of own) if (keys.has(key)) found.set(kind, (found.get(kind) ?? 0) + 1);
    for (const [kind, count] of wanted) {
      const matched = found.get(kind) ?? 0;
      if (KIND_MATCH[kind] === 'any' ? matched === 0 : matched < count) return false;
    }
    return true;
  });
}

/**
 * Orders an item's keywords for display: channel and sentiments first, then active topics, then
 * the rest by rank. `topicLimit` caps the topics only; the channel and sentiments always show.
 */
export function displayKeywords(
  keywords: readonly Keyword[],
  active: ReadonlySet<string>,
  topicLimit: number,
): Keyword[] {
  const topics = keywords.filter((k) => k.kind === 'topic');
  const ordered =
    active.size === 0
      ? topics
      : [...topics.filter((k) => active.has(k.key)), ...topics.filter((k) => !active.has(k.key))];
  return [...keywords.filter((k) => k.kind !== 'topic'), ...ordered.slice(0, topicLimit)];
}
