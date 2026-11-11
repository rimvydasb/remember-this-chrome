import { describe, expect, it } from 'vitest';
import {
  buildKeywordIndex,
  channelKey,
  countKeywords,
  displayKeywords,
  filterByKeywords,
  languageCode,
  termFrequencies,
  topicKey,
  type TermCache,
} from '../keywords';
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

describe('keywords', () => {
  it('drops stopwords, transcript fillers, digits and short words', () => {
    const counts = termFrequencies("Um, yeah, so the GRAVITY is like... 42 gravity's pull, you know? (gravity)");
    expect([...counts]).toEqual([
      ['gravity', 3],
      ['pull', 1],
    ]);
  });

  it('maps language codes and YouTube language names', () => {
    expect(languageCode('de-DE')).toBe('de');
    expect(languageCode('German (auto-generated)')).toBe('de');
    expect(languageCode('Lithuanian')).toBe('en');
    expect(languageCode(undefined)).toBe('en');
  });

  it('puts the channel first, then ranked topics', () => {
    const index = buildKeywordIndex(items);
    const first = index.get('1')!;
    expect(first[0]).toEqual({ key: channelKey('Kurzgesagt'), kind: 'channel', label: 'Kurzgesagt' });
    expect(first.slice(1, 3).map((k) => k.label)).toEqual(['black', 'holes']);
    const second = index.get('2')!.map((k) => k.label);
    expect(second[1]).toBe('sourdough');
    expect(second.slice(2, 4)).toEqual(expect.arrayContaining(['starter', 'basics']));
  });

  it('works without a channel', () => {
    const index = buildKeywordIndex([make('x', 'Rust ownership', 'Ownership and borrowing. Ownership rules.')]);
    expect(index.get('x')![0]).toMatchObject({ kind: 'topic', label: 'ownership' });
  });

  it('matches any selected channel and all selected topics', () => {
    const index = buildKeywordIndex(items);
    const both = new Set([channelKey('Kurzgesagt'), channelKey('Baker Bob')]);
    expect(filterByKeywords(items, index, both).map((i) => i.id)).toEqual(['1', '2', '3']);
    expect(filterByKeywords(items, index, new Set([topicKey('gravity'), topicKey('sourdough')]))).toEqual([]);
  });

  it('counts and filters by keyword', () => {
    const index = buildKeywordIndex(items);
    const channels = countKeywords(items, index, 'channel');
    expect(channels.map((c) => [c.keyword.label, c.count])).toEqual([
      ['Kurzgesagt', 2],
      ['Baker Bob', 1],
    ]);
    const kurz = new Set([channelKey('Kurzgesagt')]);
    expect(filterByKeywords(items, index, kurz).map((i) => i.id)).toEqual(['1', '3']);
    expect(filterByKeywords(items, index, new Set([...kurz, topicKey('orbits')])).map((i) => i.id)).toEqual(['3']);
    expect(filterByKeywords(items, index, new Set())).toHaveLength(3);
  });

  it('shows active filters among the displayed keywords', () => {
    const keywords = buildKeywordIndex(items).get('1')!;
    const last = keywords[keywords.length - 1]!;
    const shown = displayKeywords(keywords, new Set([last.key]), 3);
    expect(shown[0]!.kind).toBe('channel');
    expect(shown[1]).toEqual(last);
  });

  it('reuses cached terms and drops stale entries', () => {
    const cache: TermCache = new Map();
    buildKeywordIndex(items, cache);
    expect(cache.size).toBe(3);
    buildKeywordIndex(items.slice(0, 2), cache);
    expect(cache.size).toBe(2);
  });

  it('indexes 1,000 transcript-sized records in reasonable time', () => {
    const vocabulary = Array.from({ length: 3000 }, (_, i) => `word${String.fromCharCode(97 + (i % 26))}${i}`);
    const library = Array.from({ length: 1000 }, (_, i) =>
      make(
        String(i),
        `Video ${i}`,
        Array.from({ length: 8000 }, (_, w) => vocabulary[(w * 31 + i * 7) % 3000]).join(' '),
      ),
    );
    const cache: TermCache = new Map();
    let start = performance.now();
    buildKeywordIndex(library, cache);
    const cold = performance.now() - start;
    start = performance.now();
    buildKeywordIndex(library, cache);
    const warm = performance.now() - start;
    console.log(`keywords: cold ${cold.toFixed(0)} ms, warm ${warm.toFixed(0)} ms`);
    expect(warm).toBeLessThan(200);
  });
});
