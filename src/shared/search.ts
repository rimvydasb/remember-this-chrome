import type { SavedItem } from './types';

/** Splits a query into lowercase terms. Text in double quotes is one term. */
export function parseQuery(query: string): string[] {
  const terms: string[] = [];
  const pattern = /"([^"]+)"|(\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(query)) !== null) {
    const term = (match[1] ?? match[2] ?? '').trim().toLowerCase();
    if (term) terms.push(term);
  }
  return terms;
}

export interface IndexEntry {
  /** Lowercase `title \n channel \n description \n content`. */
  text: string;
  /** Where the content starts inside `text`. */
  contentStart: number;
}

export type SearchIndex = Map<string, IndexEntry>;

const indexKey = (item: SavedItem) => `${item.id}\u0000${item.timestamp}`;

/**
 * Precomputes a lowercase haystack per item, so each keystroke only runs `includes` checks.
 * Entries of unchanged items are reused from `previous`.
 */
export function buildSearchIndex(items: readonly SavedItem[], previous?: SearchIndex): SearchIndex {
  const index: SearchIndex = new Map();
  for (const item of items) {
    const key = indexKey(item);
    const reused = previous?.get(key);
    if (reused) {
      index.set(key, reused);
      continue;
    }
    const head = `${item.title}\n${item.meta?.channel ?? ''}\n${item.meta?.description ?? ''}\n`.toLowerCase();
    index.set(key, { text: head + item.content.toLowerCase(), contentStart: head.length });
  }
  return index;
}

export function getIndexEntry(index: SearchIndex, item: SavedItem): IndexEntry | undefined {
  return index.get(indexKey(item));
}

/** Returns the items that contain every term (in title, channel, description, or content). Keeps input order. */
export function filterItems(items: readonly SavedItem[], index: SearchIndex, terms: readonly string[]): SavedItem[] {
  if (terms.length === 0) return [...items];
  return items.filter((item) => {
    const entry = getIndexEntry(index, item);
    return entry !== undefined && terms.every((term) => entry.text.includes(term));
  });
}

/**
 * Returns a short excerpt around the first content match of any term, or the start of the text.
 * Pass a precomputed index entry to avoid lowercasing the content again.
 */
export function makeSnippet(content: string, terms: readonly string[], radius = 90, entry?: IndexEntry): string {
  const lower = entry?.text ?? content.toLowerCase();
  const offset = entry?.contentStart ?? 0;
  let position = -1;
  for (const term of terms) {
    const found = lower.indexOf(term, offset);
    if (found !== -1 && (position === -1 || found - offset < position)) position = found - offset;
  }
  if (position === -1) {
    const head = content
      .slice(0, radius * 2)
      .replace(/\s+/g, ' ')
      .trim();
    return content.length > radius * 2 ? `${head}…` : head;
  }
  const start = Math.max(0, position - radius);
  const end = Math.min(content.length, position + radius);
  const excerpt = content.slice(start, end).replace(/\s+/g, ' ').trim();
  return `${start > 0 ? '…' : ''}${excerpt}${end < content.length ? '…' : ''}`;
}

export function sortByRecent(items: readonly SavedItem[]): SavedItem[] {
  return [...items].sort((a, b) => (a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0));
}
