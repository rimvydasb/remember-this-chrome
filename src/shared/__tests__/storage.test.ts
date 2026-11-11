import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeChrome, type FakeChrome } from '../../test/fakeChrome';
import {
  addFollowUp,
  applyImport,
  clearLibrary,
  countItems,
  deleteFollowUp,
  deleteForgottenItems,
  deleteItems,
  getAllItems,
  getItem,
  isItemKey,
  putItems,
  setAiTags,
  setItemsMark,
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

describe('follow-ups', () => {
  const summary = (id: string) => ({
    id,
    type: 'llm-summary' as const,
    content: `Summary ${id}`,
    createdAt: '2026-03-01T00:00:00.000Z',
  });

  it('adds follow-ups in order and keeps the item timestamp', async () => {
    await putItems([item('a', '2026-01-01T00:00:00.000Z')]);
    expect(await addFollowUp('a', summary('f1'))).toBe(true);
    expect(await addFollowUp('a', summary('f2'))).toBe(true);
    const stored = await getItem('a');
    expect(stored?.followUps?.map((f) => f.id)).toEqual(['f1', 'f2']);
    expect(stored?.timestamp).toBe('2026-01-01T00:00:00.000Z');
  });

  it('does nothing for a missing item', async () => {
    expect(await addFollowUp('missing', summary('f1'))).toBe(false);
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });

  it('deletes a follow-up and drops the empty list', async () => {
    await putItems([item('a', '2026-01-01T00:00:00.000Z', { followUps: [summary('f1'), summary('f2')] })]);
    await deleteFollowUp('a', 'f1');
    expect((await getItem('a'))?.followUps?.map((f) => f.id)).toEqual(['f2']);
    await deleteFollowUp('a', 'f2');
    expect(await getItem('a')).toEqual(item('a', '2026-01-01T00:00:00.000Z'));
  });

  it('keeps follow-ups when the item is captured again', async () => {
    await putItems([item('a', '2026-01-01T00:00:00.000Z', { followUps: [summary('f1')] })]);
    const { item: updated } = await upsertCapture({
      title: 'New title',
      url: 'https://www.youtube.com/watch?v=a',
      type: 'youtube_transcript',
      content: 'New content',
    });
    expect(updated.followUps).toEqual([summary('f1')]);
  });
});

describe('marks', () => {
  it('sets and clears a mark without changing the timestamp', async () => {
    await putItems([item('a', '2026-01-01T00:00:00.000Z'), item('b', '2026-01-02T00:00:00.000Z')]);
    await setItemsMark(['a', 'b', 'missing'], 'loved');
    expect((await getItem('a'))?.mark).toBe('loved');
    expect((await getItem('b'))?.timestamp).toBe('2026-01-02T00:00:00.000Z');
    expect(await getItem('missing')).toBeUndefined();
    await setItemsMark(['a'], undefined);
    expect(await getItem('a')).toEqual(item('a', '2026-01-01T00:00:00.000Z'));
  });

  it('deletes only forgotten items', async () => {
    await putItems([
      item('a', '2026-01-01T00:00:00.000Z', { mark: 'forgotten' }),
      item('b', '2026-01-01T00:00:00.000Z', { mark: 'loved' }),
      item('c', '2026-01-01T00:00:00.000Z'),
    ]);
    expect(await deleteForgottenItems(['a', 'b', 'c'])).toEqual(['a']);
    expect((await getAllItems()).map((i) => i.id).sort()).toEqual(['b', 'c']);
  });

  it('keeps the mark when the item is captured again', async () => {
    await putItems([item('a', '2026-01-01T00:00:00.000Z', { mark: 'loved' })]);
    const { item: updated } = await upsertCapture({
      title: 'New title',
      url: 'https://www.youtube.com/watch?v=a',
      type: 'youtube_transcript',
      content: 'New content',
    });
    expect(updated.mark).toBe('loved');
  });
});

describe('AI tags', () => {
  const tags = (...values: string[]) => ({ tags: values, model: 'qwen3-8b', createdAt: '2026-03-01T00:00:00.000Z' });

  it('stores tags without changing the timestamp', async () => {
    await putItems([item('a', '2026-01-01T00:00:00.000Z')]);
    expect(await setAiTags('a', tags('agents'))).toBe(true);
    const stored = await getItem('a');
    expect(stored?.aiTags).toEqual(tags('agents'));
    expect(stored?.timestamp).toBe('2026-01-01T00:00:00.000Z');
  });

  it('keeps existing tags with onlyIfMissing, and replaces them without it', async () => {
    await putItems([item('a', '2026-01-01T00:00:00.000Z', { aiTags: tags('first') })]);
    expect(await setAiTags('a', tags('second'), { onlyIfMissing: true })).toBe(false);
    expect((await getItem('a'))?.aiTags?.tags).toEqual(['first']);
    expect(await setAiTags('a', tags('second'))).toBe(true);
    expect((await getItem('a'))?.aiTags?.tags).toEqual(['second']);
  });

  it('does nothing for a missing item', async () => {
    expect(await setAiTags('missing', tags('x'))).toBe(false);
  });

  it('keeps AI tags when the item is captured again', async () => {
    await putItems([item('a', '2026-01-01T00:00:00.000Z', { aiTags: tags('agents') })]);
    const { item: updated } = await upsertCapture({
      title: 'New title',
      url: 'https://www.youtube.com/watch?v=a',
      type: 'youtube_transcript',
      content: 'New content',
    });
    expect(updated.aiTags).toEqual(tags('agents'));
  });
});
