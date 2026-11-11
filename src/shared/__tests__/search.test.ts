import { describe, expect, it } from 'vitest';
import { buildSearchIndex, filterItems, getIndexEntry, makeSnippet, parseQuery, sortByRecent } from '../search';
import type { SavedItem } from '../types';

const make = (id: string, title: string, content: string, timestamp = '2026-01-01T00:00:00.000Z'): SavedItem => ({
  id,
  title,
  url: `https://example.com/${id}`,
  type: 'youtube_transcript',
  content,
  timestamp,
});

describe('search', () => {
  const items = [
    make('1', 'Procrastination', 'The instant gratification monkey takes the wheel.'),
    make('2', 'Cooking pasta', 'Salt the water generously. The monkey is not involved.'),
    make('3', 'Space', 'Rockets need a lot of fuel.'),
  ];
  const index = buildSearchIndex(items);

  it('parses terms and quoted phrases', () => {
    expect(parseQuery('  Monkey "instant gratification" ')).toEqual(['monkey', 'instant gratification']);
  });

  it('matches all terms across title and content, case-insensitively', () => {
    expect(filterItems(items, index, parseQuery('MONKEY')).map((i) => i.id)).toEqual(['1', '2']);
    expect(filterItems(items, index, parseQuery('monkey pasta')).map((i) => i.id)).toEqual(['2']);
    expect(filterItems(items, index, parseQuery('"takes the wheel"')).map((i) => i.id)).toEqual(['1']);
    expect(filterItems(items, index, [])).toHaveLength(3);
  });

  it('makes a snippet around the first content match', () => {
    const item = make('x', 'T', `${'a '.repeat(200)}needle ${'b '.repeat(200)}`);
    const entry = getIndexEntry(buildSearchIndex([item]), item);
    const snippet = makeSnippet(item.content, ['needle'], 20, entry);
    expect(snippet).toContain('needle');
    expect(snippet.startsWith('…')).toBe(true);
    expect(snippet.endsWith('…')).toBe(true);
  });

  it('reuses index entries for unchanged items', () => {
    const next = buildSearchIndex(items, index);
    expect(getIndexEntry(next, items[0]!)).toBe(getIndexEntry(index, items[0]!));
  });

  it('sorts by most recent first', () => {
    const sorted = sortByRecent([make('a', '', '', '2026-01-01T00:00:00Z'), make('b', '', '', '2026-06-01T00:00:00Z')]);
    expect(sorted.map((i) => i.id)).toEqual(['b', 'a']);
  });

  it('NFR-4: filters 1,000 transcript-sized records quickly', () => {
    const words = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel', 'india', 'juliet'];
    const library = Array.from({ length: 1000 }, (_, i) =>
      make(String(i), `Video ${i}`, Array.from({ length: 8000 }, (_, w) => words[(w * 7 + i) % 10]).join(' ')),
    );
    library[777] = { ...library[777]!, content: `${library[777]!.content} unicorn` };

    let start = performance.now();
    const big = buildSearchIndex(library);
    const indexMs = performance.now() - start;

    start = performance.now();
    const hits = filterItems(library, big, parseQuery('unicorn'));
    const searchMs = performance.now() - start;

    expect(hits.map((i) => i.id)).toEqual(['777']);
    console.log(
      `1,000 records (~${Math.round((library[0]!.content.length * 1000) / 1e6)} MB): index ${indexMs.toFixed(0)} ms, search ${searchMs.toFixed(1)} ms`,
    );
    expect(searchMs).toBeLessThan(100);
  });
});
