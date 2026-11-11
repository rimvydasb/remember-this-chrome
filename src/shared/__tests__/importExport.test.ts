import { describe, expect, it } from 'vitest';
import { buildExportPayload, ImportError, parseImport, planImport } from '../importExport';
import type { SavedItem } from '../types';

const item = (id: string, timestamp = '2026-01-01T00:00:00.000Z', extra: Partial<SavedItem> = {}): SavedItem => ({
  id,
  title: `Title ${id}`,
  url: `https://www.youtube.com/watch?v=${id}`,
  type: 'youtube_transcript',
  content: `Content ${id}`,
  timestamp,
  ...extra,
});

describe('parseImport', () => {
  it('round-trips an export payload', () => {
    const items = [item('a'), item('b', '2026-02-01T00:00:00.000Z', { meta: { channel: 'TED' } })];
    const parsed = parseImport(JSON.stringify(buildExportPayload(items)));
    expect(parsed.items).toEqual(items);
    expect(parsed.rejected).toEqual([]);
  });

  it('accepts a bare array', () => {
    expect(parseImport(JSON.stringify([item('a')])).items).toHaveLength(1);
  });

  it('skips invalid records and reports them', () => {
    const parsed = parseImport(JSON.stringify([item('a'), { id: 'x' }, { ...item('c'), type: 'video' }]));
    expect(parsed.items.map((i) => i.id)).toEqual(['a']);
    expect(parsed.rejected).toEqual([
      { index: 1, reason: 'missing "title"' },
      { index: 2, reason: 'unknown "type"' },
    ]);
  });

  it('keeps the newest copy when the file has duplicate IDs', () => {
    const parsed = parseImport(JSON.stringify([item('a', '2026-01-01T00:00:00Z'), item('a', '2026-03-01T00:00:00Z')]));
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0]!.timestamp).toBe('2026-03-01T00:00:00.000Z');
  });

  it('drops unknown fields and malformed metadata', () => {
    const parsed = parseImport(JSON.stringify([{ ...item('a'), evil: '<script>', meta: { channel: 5 } }]));
    expect(parsed.items[0]).toEqual(item('a'));
  });

  it.each([
    ['not json', 'not valid JSON'],
    ['{"hello":1}', 'does not contain'],
    ['{"format":"other","items":[]}', 'Unknown file format'],
    ['{"format":"remember-this-library","version":99,"items":[]}', 'newer version'],
    ['[{"id":1}]', 'No valid records'],
  ])('rejects %s', (text, message) => {
    expect(() => parseImport(text)).toThrow(ImportError);
    expect(() => parseImport(text)).toThrow(message);
  });
});

describe('planImport', () => {
  const existing = [item('a', '2026-01-01T00:00:00.000Z'), item('b', '2026-05-01T00:00:00.000Z')];
  const incoming = [item('b', '2026-04-01T00:00:00.000Z'), item('c'), item('a', '2026-02-01T00:00:00.000Z')];

  it('merge adds new items, updates only newer ones, and deletes nothing', () => {
    const plan = planImport(existing, incoming, 'merge');
    expect(plan.toWrite.map((i) => i.id).sort()).toEqual(['a', 'c']);
    expect(plan).toMatchObject({ added: 1, updated: 1, unchanged: 1, removed: 0, toDelete: [] });
  });

  it('replace writes all incoming items and removes the rest', () => {
    const plan = planImport([...existing, item('z')], incoming, 'replace');
    expect(plan.toWrite).toHaveLength(3);
    expect(plan.toDelete).toEqual(['z']);
  });
});

describe('video details in import files', () => {
  it('round-trips description, views, chapters, and links', () => {
    const meta = {
      videoId: 'a',
      description: 'Text https://a.example',
      viewCount: 407883,
      chapters: [{ startSec: 0, title: 'Start' }],
      links: [{ url: 'https://a.example', label: 'A' }, { url: 'https://b.example' }],
    };
    const items = [item('a', '2026-01-01T00:00:00.000Z', { meta })];
    expect(parseImport(JSON.stringify(buildExportPayload(items))).items).toEqual(items);
  });

  it('drops malformed video details and unsafe links', () => {
    const parsed = parseImport(
      JSON.stringify([
        item('a', '2026-01-01T00:00:00.000Z', {
          meta: {
            channel: 'TED',
            viewCount: -5,
            chapters: [{ startSec: 'x', title: 'Bad' }, { startSec: 3, title: 'Good' }, 'nope'],
            links: [{ url: 'javascript:alert(1)' }, { url: 'not a url' }, { url: 'https://ok.example', label: 7 }],
          } as unknown as SavedItem['meta'],
        }),
      ]),
    );
    expect(parsed.items[0]!.meta).toEqual({
      channel: 'TED',
      chapters: [{ startSec: 3, title: 'Good' }],
      links: [{ url: 'https://ok.example' }],
    });
  });
});

describe('follow-ups in import files', () => {
  it('keeps valid follow-ups and drops invalid ones', () => {
    const raw = {
      id: 'a',
      title: 'T',
      url: 'https://www.youtube.com/watch?v=a',
      type: 'youtube_transcript',
      content: 'C',
      timestamp: '2026-01-01T00:00:00.000Z',
      followUps: [
        { id: 'f1', type: 'llm-summary', content: 'Sum', createdAt: '2026-01-02T00:00:00Z', model: 'qwen' },
        { id: 'f2', type: 'unknown-kind', content: 'x', createdAt: '2026-01-02T00:00:00Z' },
        { id: 'f3', type: 'llm-summary', content: 'x', createdAt: 'not a date' },
        'junk',
      ],
    };
    const { items } = parseImport(JSON.stringify([raw]));
    expect(items[0]!.followUps).toEqual([
      { id: 'f1', type: 'llm-summary', content: 'Sum', createdAt: '2026-01-02T00:00:00.000Z', model: 'qwen' },
    ]);
  });

  it('round-trips follow-ups through export', () => {
    const item: SavedItem = {
      id: 'a',
      title: 'T',
      url: 'u',
      type: 'youtube_transcript',
      content: 'C',
      timestamp: '2026-01-01T00:00:00.000Z',
      followUps: [{ id: 'f1', type: 'llm-summary', content: 'Sum', createdAt: '2026-01-02T00:00:00.000Z' }],
    };
    expect(parseImport(JSON.stringify(buildExportPayload([item]))).items).toEqual([item]);
  });
});

describe('marks in import files', () => {
  const raw = (mark: unknown) => ({
    id: 'a',
    title: 'T',
    url: 'u',
    type: 'youtube_transcript',
    content: 'C',
    timestamp: '2026-01-01T00:00:00.000Z',
    mark,
  });

  it('keeps known marks and drops unknown ones', () => {
    expect(parseImport(JSON.stringify([raw('loved')])).items[0]!.mark).toBe('loved');
    expect(parseImport(JSON.stringify([raw('forgotten')])).items[0]!.mark).toBe('forgotten');
    expect(parseImport(JSON.stringify([raw('starred')])).items[0]).not.toHaveProperty('mark');
  });
});
