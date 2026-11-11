import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeChrome, type FakeChrome } from '../../test/fakeChrome';
import {
  applyImport,
  clearLibrary,
  countItems,
  deleteItems,
  getAllItems,
  getItem,
  isItemKey,
  putItems,
  upsertCapture,
} from '../storage';
import type { SavedItem } from '../types';

const item = (id: string, timestamp: string, extra: Partial<SavedItem> = {}): SavedItem => ({
  id,
  title: `Title ${id}`,
  url: `https://www.youtube.com/watch?v=${id}`,
  type: 'youtube_transcript',
  content: `Content ${id}`,
  timestamp,
  ...extra,
});

let chrome: FakeChrome;

beforeEach(() => {
  chrome = createFakeChrome();
  vi.stubGlobal('chrome', chrome);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('storage', () => {
  it('stores each item under its own key and ignores other keys', async () => {
    chrome.storage.local.store.set('settings', { theme: 'dark' });
    await putItems([item('a', '2026-01-01T00:00:00.000Z'), item('b', '2026-02-01T00:00:00.000Z')]);

    expect([...chrome.storage.local.store.keys()].filter(isItemKey).sort()).toEqual(['item:a', 'item:b']);
    expect(await countItems()).toBe(2);
    expect((await getAllItems()).map((i) => i.id)).toEqual(['b', 'a']);
    expect(await getItem('a')).toEqual(item('a', '2026-01-01T00:00:00.000Z'));
    expect(await getItem('missing')).toBeUndefined();
  });

  it('skips storage calls for empty batches', async () => {
    await putItems([]);
    await deleteItems([]);
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
    expect(chrome.storage.local.remove).not.toHaveBeenCalled();
  });

  it('deletes items and clears only library keys', async () => {
    chrome.storage.local.store.set('settings', 1);
    await putItems([
      item('a', '2026-01-01T00:00:00Z'),
      item('b', '2026-01-01T00:00:00Z'),
      item('c', '2026-01-01T00:00:00Z'),
    ]);
    await deleteItems(['a']);
    expect(await countItems()).toBe(2);
    await clearLibrary();
    expect(await countItems()).toBe(0);
    expect(chrome.storage.local.store.has('settings')).toBe(true);
  });
});

describe('upsertCapture', () => {
  const capture = {
    title: 'Video',
    url: 'https://www.youtube.com/watch?v=abc',
    type: 'youtube_transcript' as const,
    content: 'Hello',
    meta: { videoId: 'abc', viewCount: 10 },
  };

  it('creates a new item with an ID and the capture time', async () => {
    vi.useFakeTimers({ now: new Date('2026-11-11T10:00:00Z'), toFake: ['Date'] });
    const { item: saved, created } = await upsertCapture(capture);
    expect(created).toBe(true);
    expect(saved).toMatchObject({ ...capture, timestamp: '2026-11-11T10:00:00.000Z' });
    expect(saved.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(await getItem(saved.id)).toEqual(saved);
  });

  it('updates the item with the same URL and type, keeping its ID and refreshing metadata', async () => {
    const first = await upsertCapture(capture);
    const second = await upsertCapture({ ...capture, content: 'Hello again', meta: { videoId: 'abc', viewCount: 20 } });
    expect(second.created).toBe(false);
    expect(second.item.id).toBe(first.item.id);
    expect(await countItems()).toBe(1);
    expect((await getItem(first.item.id))?.meta?.viewCount).toBe(20);
  });

  it('does not merge items of another type', async () => {
    await upsertCapture(capture);
    const other = await upsertCapture({ ...capture, type: 'webpage_text' });
    expect(other.created).toBe(true);
    expect(await countItems()).toBe(2);
  });
});

describe('applyImport', () => {
  it('replaces the library with the imported records', async () => {
    await putItems([item('a', '2026-01-01T00:00:00.000Z'), item('z', '2026-01-01T00:00:00.000Z')]);
    const plan = await applyImport(
      [item('a', '2026-01-01T00:00:00.000Z'), item('b', '2026-01-01T00:00:00.000Z')],
      'replace',
    );
    expect(plan).toMatchObject({ added: 1, updated: 1, removed: 1 });
    expect((await getAllItems()).map((i) => i.id).sort()).toEqual(['a', 'b']);
  });

  it('writes new data before it removes stale records', async () => {
    await putItems([item('z', '2026-01-01T00:00:00.000Z')]);
    chrome.storage.local.set.mockClear();
    await applyImport([item('b', '2026-01-01T00:00:00.000Z')], 'replace');
    expect(chrome.storage.local.set.mock.invocationCallOrder[0]!).toBeLessThan(
      chrome.storage.local.remove.mock.invocationCallOrder[0]!,
    );
  });
});
