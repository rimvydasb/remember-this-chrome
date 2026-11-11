import { describe, expect, it } from 'vitest';
import { mergeCapture, type Capture } from '../mergeCapture';
import type { SavedItem } from '../types';

const FIRST = new Date('2026-11-01T10:00:00.000Z');
const LATER = new Date('2026-11-11T10:00:00.000Z');
const URL_ = 'https://www.youtube.com/watch?v=abc';

const fullMeta = {
  videoId: 'abc',
  channel: 'Anthropic',
  language: 'English',
  durationSec: 150,
  description: 'Old text.\nDocs: https://old.example',
  viewCount: 1000,
  viewCountAt: FIRST.toISOString(),
  chapters: [
    { startSec: 0, title: 'Start' },
    { startSec: 61, title: 'Middle' },
  ],
  links: [{ url: 'https://old.example', label: 'Docs' }],
};

const stored: SavedItem = {
  id: 'id-1',
  title: 'Old title',
  url: URL_,
  type: 'youtube_transcript',
  content: 'Old transcript.',
  timestamp: FIRST.toISOString(),
  meta: fullMeta,
};

const capture = (meta: Capture['meta'], extra: Partial<Capture> = {}): Capture => ({
  title: 'Old title',
  url: URL_,
  type: 'youtube_transcript',
  content: 'Old transcript.',
  meta,
  ...extra,
});

const merge = (existing: SavedItem | undefined, next: Capture, fallbackTitle?: string) =>
  mergeCapture(existing, next, { id: 'new-id', now: LATER, fallbackTitle });

describe('mergeCapture: new item', () => {
  it('creates the item and records when the view count was read', () => {
    const { item, changed } = merge(undefined, capture({ videoId: 'abc', viewCount: 5 }));
    expect(item).toEqual({
      id: 'new-id',
      title: 'Old title',
      url: URL_,
      type: 'youtube_transcript',
      content: 'Old transcript.',
      timestamp: LATER.toISOString(),
      meta: { videoId: 'abc', viewCount: 5, viewCountAt: LATER.toISOString() },
    });
    expect(changed).toEqual([]);
  });

  it('uses the fallback title when the capture has none', () => {
    expect(merge(undefined, capture(undefined, { title: '  ' }), 'YouTube video abc').item.title).toBe(
      'YouTube video abc',
    );
  });

  it('leaves meta out when there is none', () => {
    expect(merge(undefined, capture(undefined)).item).not.toHaveProperty('meta');
  });
});

describe('mergeCapture: update', () => {
  it('keeps the ID and refreshes the timestamp, view count, and its date', () => {
    const { item, changed } = merge(stored, capture({ ...fullMeta, viewCount: 2500, viewCountAt: undefined }));
    expect(item.id).toBe('id-1');
    expect(item.timestamp).toBe(LATER.toISOString());
    expect(item.meta).toEqual({ ...fullMeta, viewCount: 2500, viewCountAt: LATER.toISOString() });
    expect(changed).toEqual(['views']);
  });

  it('keeps every stored part that the new capture could not read', () => {
    const { item, changed } = merge(stored, capture({ videoId: 'abc' }, { title: '' }));
    expect(item).toEqual({ ...stored, timestamp: LATER.toISOString() });
    expect(changed).toEqual([]);
  });

  it('does not move the view count date when the view count was not read', () => {
    const { item } = merge(stored, capture({ videoId: 'abc', description: 'New text.' }));
    expect(item.meta?.viewCount).toBe(1000);
    expect(item.meta?.viewCountAt).toBe(FIRST.toISOString());
  });

  it('replaces the description and its links together', () => {
    const next = capture({
      videoId: 'abc',
      description: 'New text.\nhttps://new.example',
      links: [{ url: 'https://new.example' }],
    });
    const { item, changed } = merge(stored, next);
    expect(item.meta?.description).toBe('New text.\nhttps://new.example');
    expect(item.meta?.links).toEqual([{ url: 'https://new.example' }]);
    expect(changed).toEqual(['description', 'links']);
  });

  it('removes the links when the new description has none', () => {
    const { item, changed } = merge(stored, capture({ videoId: 'abc', description: 'No links any more.' }));
    expect(item.meta).not.toHaveProperty('links');
    expect(changed).toEqual(['description', 'links']);
  });

  it('keeps the links when the description could not be read', () => {
    expect(merge(stored, capture({ videoId: 'abc', description: '   ' })).item.meta?.links).toEqual(fullMeta.links);
  });

  it('replaces chapters only when the new capture has some', () => {
    const chapters = [{ startSec: 0, title: 'Renamed' }];
    expect(merge(stored, capture({ videoId: 'abc', chapters })).item.meta?.chapters).toEqual(chapters);
    expect(merge(stored, capture({ videoId: 'abc', chapters: [] })).item.meta?.chapters).toEqual(fullMeta.chapters);
  });

  it('updates title, content, channel, duration, and language when present', () => {
    const { item, changed } = merge(
      stored,
      capture(
        { channel: 'New channel', durationSec: 151, language: 'English (auto-generated)' },
        { title: 'New title', content: 'New transcript.' },
      ),
    );
    expect(item).toMatchObject({
      title: 'New title',
      content: 'New transcript.',
      meta: { channel: 'New channel', durationSec: 151, language: 'English (auto-generated)', videoId: 'abc' },
    });
    expect(changed).toEqual(['title', 'content', 'channel', 'duration', 'language']);
  });

  it('keeps metadata fields it does not know about', () => {
    const withExtra = { ...stored, meta: { ...fullMeta, futureField: 1 } } as SavedItem;
    expect(merge(withExtra, capture({ viewCount: 1 })).item.meta).toMatchObject({ futureField: 1 });
  });

  it('upgrades an older item without metadata', () => {
    const { meta: _meta, ...old } = stored;
    const { item, changed } = merge(old, capture({ videoId: 'abc', viewCount: 7 }));
    expect(item.meta).toEqual({ videoId: 'abc', viewCount: 7, viewCountAt: LATER.toISOString() });
    expect(changed).toEqual(['views']);
  });
});
