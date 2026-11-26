import { describe, expect, it } from 'vitest';
import {
  buildKeywordIndex,
  countKeywords,
  displayKeywords,
  filterByKeywords,
  keysWithout,
  keywordKey,
  termCacheKey,
  type KeywordIndex,
  type TermCache,
} from '../keywords';
import { itemTerms } from '../terms';
import { sentimentTags, topicTags } from '../../test/items';
import type { SavedItem } from '../types';

const make = (id: string, title: string, content: string, channel?: string): SavedItem => ({
  id,
  title,
  url: `https://example.com/${id}`,
  type: 'youtube_transcript',
  content,
  timestamp: '2026-01-01T00:00:00.000Z',
  ...(channel ? { meta: { channel } } : {}),
});

const items = [
  make(
    '1',
    'Black holes explained',
    'Black holes bend spacetime. Gravity near a black hole is extreme. Gravity wins.',
    'Kurzgesagt',
  ),
  make(
    '2',
    'Sourdough basics',
    'Sourdough needs a starter. Feed the starter flour and water. Bake the sourdough hot.',
    'Baker Bob',
  ),
  make(
    '3',
    'Gravity and orbits',
    'Orbits are falling sideways. Gravity pulls, orbits curve. Gravity again.',
    'Kurzgesagt',
  ),
];

const termsOf = (list: readonly SavedItem[]): TermCache =>
  new Map(list.map((item) => [termCacheKey(item), itemTerms(item)]));
const indexOf = (list: readonly SavedItem[]): KeywordIndex => buildKeywordIndex(list, termsOf(list));

describe('keywords', () => {
  it('puts the channel first, then ranked topics', () => {
    const index = indexOf(items);
    const first = index.get('1')!;
    expect(first[0]).toEqual({ key: keywordKey('channel', 'Kurzgesagt'), kind: 'channel', label: 'Kurzgesagt' });
    expect(first.slice(1, 3).map((k) => k.label)).toEqual(['hole', 'gravity']);
    const second = index.get('2')!.map((k) => k.label);
    expect(second[1]).toBe('sourdough');
    expect(second.slice(2, 4)).toEqual(expect.arrayContaining(['starter', 'basic']));
  });

  it('works without a channel', () => {
    const index = indexOf([make('x', 'Rust ownership', 'Ownership and borrowing. Ownership rules.')]);
    expect(index.get('x')![0]).toMatchObject({ kind: 'topic', label: 'ownership' });
  });

  it('matches any selected channel and all selected topics', () => {
    const index = indexOf(items);
    const both = new Set([keywordKey('channel', 'Kurzgesagt'), keywordKey('channel', 'Baker Bob')]);
    expect(filterByKeywords(items, index, both).map((i) => i.id)).toEqual(['1', '2', '3']);
    expect(
      filterByKeywords(items, index, new Set([keywordKey('topic', 'gravity'), keywordKey('topic', 'sourdough')])),
    ).toEqual([]);
  });

  it('counts and filters by keyword', () => {
    const index = indexOf(items);
    const channels = countKeywords(items, index, 'channel');
    expect(channels.map((c) => [c.keyword.label, c.count])).toEqual([
      ['Kurzgesagt', 2],
      ['Baker Bob', 1],
    ]);
    const kurz = new Set([keywordKey('channel', 'Kurzgesagt')]);
    expect(filterByKeywords(items, index, kurz).map((i) => i.id)).toEqual(['1', '3']);
    expect(filterByKeywords(items, index, new Set([...kurz, keywordKey('topic', 'orbit')])).map((i) => i.id)).toEqual([
      '3',
    ]);
    expect(filterByKeywords(items, index, new Set())).toHaveLength(3);
  });

  it('shows active filters among the displayed keywords', () => {
    const keywords = indexOf(items).get('1')!;
    const last = keywords[keywords.length - 1]!;
    const shown = displayKeywords(keywords, new Set([last.key]), 3);
    expect(shown[0]!.kind).toBe('channel');
    expect(shown[1]).toEqual(last);
  });

  it('gives items without extracted terms only their channel', () => {
    const index = buildKeywordIndex(items, termsOf(items.slice(1)));
    expect(index.get('1')).toEqual([
      { key: keywordKey('channel', 'Kurzgesagt'), kind: 'channel', label: 'Kurzgesagt' },
    ]);
    expect(index.get('2')!.length).toBeGreaterThan(1);
  });

  it('shows acronyms in capitals', () => {
    const index = indexOf([make('a', 'AI news', 'AI models and AI agents. The agents use an API.')]);
    expect(index.get('a')!.map((k) => k.label)).toEqual(expect.arrayContaining(['AI', 'agent', 'API']));
    expect(index.get('a')!.find((k) => k.label === 'AI')!.key).toBe(keywordKey('topic', 'ai'));
  });

  it('uses topic tags instead of extracted terms, after the channel', () => {
    const tagged = { ...items[0]!, tags: [...topicTags('AI agents', 'Gravity'), { ...topicTags('ai  agents')[0]! }] };
    const library = [tagged, ...items.slice(1)];
    const index = indexOf(library);
    expect(index.get('1')).toEqual([
      { key: keywordKey('channel', 'Kurzgesagt'), kind: 'channel', label: 'Kurzgesagt' },
      { key: keywordKey('topic', 'ai agents'), kind: 'topic', label: 'AI agents' },
      { key: keywordKey('topic', 'gravity'), kind: 'topic', label: 'Gravity' },
    ]);
    // An AI tag and an extracted term with the same text are one filter.
    expect(filterByKeywords(library, index, new Set([keywordKey('topic', 'gravity')])).map((i) => i.id)).toEqual([
      '1',
      '3',
    ]);
  });

  it('puts sentiments after the channel and keeps extracted topics for items without topic tags', () => {
    const tagged = { ...items[0]!, tags: sentimentTags('informative', 'calm') };
    const index = indexOf([tagged, ...items.slice(1)]);
    const keywords = index.get('1')!;
    expect(keywords.slice(0, 3).map((k) => `${k.kind}:${k.label}`)).toEqual([
      'channel:Kurzgesagt',
      'sentiment:informative',
      'sentiment:calm',
    ]);
    expect(keywords.slice(3, 5).map((k) => k.label)).toEqual(['hole', 'gravity']);
    // Channel and sentiments always show; the limit is for topics.
    expect(displayKeywords(keywords, new Set(), 1).map((k) => k.kind)).toEqual([
      'channel',
      'sentiment',
      'sentiment',
      'topic',
    ]);
  });

  it('matches any selected sentiment, combined with the other kinds by AND', () => {
    const library = [
      { ...items[0]!, tags: sentimentTags('informative') },
      { ...items[1]!, tags: sentimentTags('optimistic') },
      { ...items[2]!, tags: sentimentTags('calm', 'informative') },
    ];
    const index = indexOf(library);
    const informative = keywordKey('sentiment', 'informative');
    const either = new Set([informative, keywordKey('sentiment', 'optimistic')]);
    expect(filterByKeywords(library, index, either).map((i) => i.id)).toEqual(['1', '2', '3']);
    const narrowed = new Set([informative, keywordKey('topic', 'orbit')]);
    expect(filterByKeywords(library, index, narrowed).map((i) => i.id)).toEqual(['3']);
    expect(countKeywords(library, index, 'sentiment').map((c) => [c.keyword.label, c.count])).toEqual([
      ['informative', 2],
      ['calm', 1],
      ['optimistic', 1],
    ]);
    expect([...keysWithout(narrowed, 'sentiment')]).toEqual([keywordKey('topic', 'orbit')]);
  });

  it('ranks 1,000 items in reasonable time', () => {
    const cache: TermCache = new Map();
    const library = Array.from({ length: 1000 }, (_, i) => make(String(i), `Video ${i}`, ''));
    for (const item of library) {
      const terms = Array.from({ length: 60 }, (_, t): [string, number] => [
        `term${(t * 31 + Number(item.id) * 7) % 3000}`,
        60 - t,
      ]);
      cache.set(termCacheKey(item), { terms, total: 8000, acronyms: [] });
    }
    const start = performance.now();
    buildKeywordIndex(library, cache);
    const elapsed = performance.now() - start;
    console.log(`keywords: ${elapsed.toFixed(0)} ms`);
    expect(elapsed).toBeLessThan(200);
  });
});
