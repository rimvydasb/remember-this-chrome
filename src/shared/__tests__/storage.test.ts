import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeChrome, type FakeChrome } from '../../test/fakeChrome';
import {
  addFollowUp,
  applyImport,
  clearLibrary,
  countItems,
  createCatalog,
  getCatalogs,
  deleteFollowUp,
  updateFollowUp,
  deleteForgottenItems,
  deleteItems,
  getAllItems,
  getItem,
  isItemKey,
  putItems,
  setTags,
  setItemsMark,
  upsertCapture,
} from '../storage';
import { sentimentTags, topicTags } from '../../test/items';
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
    generatedContent: `Summary ${id}`,
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

  it('updates a follow-up, and reports a missing one', async () => {
    await putItems([item('a', '2026-01-01T00:00:00.000Z', { followUps: [summary('f1')] })]);
    expect(await updateFollowUp('a', 'f1', { generatedContent: 'New', model: 'm' })).toBe(true);
    expect((await getItem('a'))?.followUps).toEqual([{ ...summary('f1'), generatedContent: 'New', model: 'm' }]);
    expect(await updateFollowUp('a', 'missing', { generatedContent: 'x' })).toBe(false);
    expect(await updateFollowUp('missing', 'f1', { generatedContent: 'x' })).toBe(false);
  });

  it('reads follow-ups stored with the old `content` field', async () => {
    const { generatedContent, ...legacy } = summary('f1');
    await putItems([
      item('a', '2026-01-01T00:00:00.000Z', { followUps: [{ ...legacy, content: generatedContent } as never] }),
    ]);
    expect((await getItem('a'))?.followUps).toEqual([summary('f1')]);
    expect((await getAllItems())[0]?.followUps).toEqual([summary('f1')]);
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

describe('tags', () => {
  const labels = (stored: SavedItem | undefined) => stored?.tags?.map((tag) => `${tag.source}:${tag.label}`);

  it('stores tags without changing the timestamp', async () => {
    await putItems([item('a', '2026-01-01T00:00:00.000Z')]);
    expect(await setTags('a', 'ai-topics', topicTags('agents'))).toBe(true);
    const stored = await getItem('a');
    expect(stored?.tags).toEqual(topicTags('agents'));
    expect(stored?.timestamp).toBe('2026-01-01T00:00:00.000Z');
  });

  it('keeps existing tags with onlyIfMissing, and replaces them without it', async () => {
    await putItems([item('a', '2026-01-01T00:00:00.000Z', { tags: topicTags('first') })]);
    expect(await setTags('a', 'ai-topics', topicTags('second'), { onlyIfMissing: true })).toBe(false);
    expect(labels(await getItem('a'))).toEqual(['ai-topics:first']);
    expect(await setTags('a', 'ai-topics', topicTags('second'))).toBe(true);
    expect(labels(await getItem('a'))).toEqual(['ai-topics:second']);
  });

  it('replaces only the tags of the given source, and removes them with an empty list', async () => {
    await putItems([
      item('a', '2026-01-01T00:00:00.000Z', { tags: [...topicTags('sleep'), ...sentimentTags('bearish')] }),
    ]);
    await setTags('a', 'ai-sentiment', sentimentTags('bullish', 'calm'));
    expect(labels(await getItem('a'))).toEqual(['ai-topics:sleep', 'ai-sentiment:bullish', 'ai-sentiment:calm']);
    await setTags('a', 'ai-sentiment', []);
    expect(labels(await getItem('a'))).toEqual(['ai-topics:sleep']);
    await setTags('a', 'ai-topics', []);
    expect(await getItem('a')).not.toHaveProperty('tags');
  });

  it('does nothing for a missing item', async () => {
    expect(await setTags('missing', 'ai-topics', topicTags('x'))).toBe(false);
  });

  it('keeps tags when the item is captured again', async () => {
    await putItems([item('a', '2026-01-01T00:00:00.000Z', { tags: topicTags('agents') })]);
    const { item: updated } = await upsertCapture({
      title: 'New title',
      url: 'https://www.youtube.com/watch?v=a',
      type: 'youtube_transcript',
      content: 'New content',
    });
    expect(updated.tags).toEqual(topicTags('agents'));
  });

  it('reads items stored with aiTags and an llm-sentiment follow-up as tags', async () => {
    const question = {
      id: 'q',
      type: 'user-question',
      userContent: 'Why?',
      generatedContent: 'Because.',
      createdAt: '2026-01-02T00:00:00.000Z',
    };
    await chrome.storage.local.set({
      'item:a': {
        ...item('a', '2026-01-01T00:00:00.000Z'),
        aiTags: { tags: ['sleep', 'memory'], model: 'm1', createdAt: '2026-01-02T00:00:00.000Z' },
        followUps: [
          { id: 's1', type: 'llm-sentiment', generatedContent: 'bearish', createdAt: '2026-01-02T00:00:00.000Z' },
          question,
          {
            id: 's2',
            type: 'llm-sentiment',
            generatedContent: 'calm, informative',
            model: 'm2',
            createdAt: '2026-01-03T00:00:00.000Z',
          },
        ],
      },
    });
    const stored = await getItem('a');
    expect(stored).not.toHaveProperty('aiTags');
    expect(stored?.followUps).toEqual([question]);
    expect(labels(stored)).toEqual([
      'ai-topics:sleep',
      'ai-topics:memory',
      'ai-sentiment:calm',
      'ai-sentiment:informative',
    ]);
    expect(stored?.tags?.[0]).toMatchObject({ kind: 'topic', model: 'm1', createdAt: '2026-01-02T00:00:00.000Z' });
    expect(stored?.tags?.[2]).toMatchObject({ kind: 'sentiment', model: 'm2', createdAt: '2026-01-03T00:00:00.000Z' });
  });
});

describe('concurrent updates', () => {
  const followUp = (id: string) => ({
    id,
    type: 'user-question' as const,
    userContent: id,
    generatedContent: '',
    createdAt: '2026-01-01T00:00:00.000Z',
  });

  it('keeps every follow-up when several are added at once', async () => {
    await putItems([item('a', '2026-01-01T00:00:00.000Z')]);
    await Promise.all(['q1', 'q2', 'q3'].map((id) => addFollowUp('a', followUp(id))));
    expect((await getItem('a'))?.followUps?.map((f) => f.id)).toEqual(['q1', 'q2', 'q3']);
  });

  it('keeps every answer when several questions are answered at once', async () => {
    await putItems([item('a', '2026-01-01T00:00:00.000Z', { followUps: [followUp('q1'), followUp('q2')] })]);
    await Promise.all([
      updateFollowUp('a', 'q1', { generatedContent: 'one' }),
      updateFollowUp('a', 'q2', { generatedContent: 'two' }),
    ]);
    expect((await getItem('a'))?.followUps?.map((f) => f.generatedContent)).toEqual(['one', 'two']);
  });

  it('keeps tags and follow-ups that are saved at the same time', async () => {
    await putItems([item('a', '2026-01-01T00:00:00.000Z')]);
    await Promise.all([
      setTags('a', 'ai-topics', topicTags('sleep')),
      addFollowUp('a', followUp('q1')),
      setItemsMark(['a'], 'loved'),
    ]);
    const stored = await getItem('a');
    expect(stored?.tags).toEqual(topicTags('sleep'));
    expect(stored?.followUps).toHaveLength(1);
    expect(stored?.mark).toBe('loved');
  });

  it('keeps every catalog that is created at the same time', async () => {
    await Promise.all(['A', 'B', 'C'].map((name) => createCatalog(name)));
    expect((await getCatalogs()).map((c) => c.name)).toEqual(['Recents', 'A', 'B', 'C']);
  });

  it('keeps working after a failed update', async () => {
    await putItems([item('a', '2026-01-01T00:00:00.000Z')]);
    chrome.storage.local.set.mockRejectedValueOnce(new Error('quota'));
    await expect(addFollowUp('a', followUp('q1'))).rejects.toThrow('quota');
    await expect(addFollowUp('a', followUp('q2'))).resolves.toBe(true);
  });
});
