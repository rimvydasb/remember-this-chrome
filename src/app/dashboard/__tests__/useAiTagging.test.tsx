// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LlmError } from '../../../llm';
import { DEFAULT_SETTINGS, SETTINGS_KEY } from '../../../shared/settings';
import type { SavedItem } from '../../../shared/types';
import { resetLlmMocks } from '../../../test/llmMock';
import { installDashboardEnvironment, makeItem } from '../../test/render';
import { useAiTagging } from '../useAiTagging';

const llm = await vi.hoisted(async () => (await import('../../../test/llmMock')).createLlmMocks());
vi.mock('../../../llm', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../llm')>()),
  ...llm,
}));
// The generation steps of the pipelines are the seams: the tests answer for the LLM here.
vi.mock('../../../followups/summary/generateSummary', () => ({ generateSummary: llm.summarize }));
vi.mock('../../../followups/questions/generateAnswer', () => ({ generateAnswer: llm.answerQuestion }));
vi.mock('../../../followups/tagging/generateTags', () => ({ generateTags: llm.generateTags }));

let fake: ReturnType<typeof installDashboardEnvironment>;
const tagsOf = (id: string) => (fake.storage.local.store.get(`item:${id}`) as SavedItem).aiTags?.tags;

function setup(items: SavedItem[], settings: Partial<typeof DEFAULT_SETTINGS.llm> = {}) {
  fake = installDashboardEnvironment();
  fake.storage.local.store.set(SETTINGS_KEY, { llm: { ...DEFAULT_SETTINGS.llm, ...settings } });
  for (const item of items) fake.storage.local.store.set(`item:${item.id}`, item);
}

const tags = (...names: string[]) => ({ tags: names, createdAt: '2026-02-01T00:00:00.000Z', model: 'm' });

beforeEach(() => {
  vi.unstubAllGlobals();
  resetLlmMocks(llm);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('useAiTagging', () => {
  it('tags the items that have no AI tags, newest first', async () => {
    const items = [
      makeItem({ id: 'new', timestamp: '2026-03-01T00:00:00.000Z' }),
      makeItem({ id: 'old', timestamp: '2026-01-01T00:00:00.000Z' }),
    ];
    setup(items);
    llm.generateTags.mockImplementation(async (_s, item: SavedItem) => tags(`tag-${item.title}`));
    renderHook(() => useAiTagging(items, undefined));

    await waitFor(() => expect(tagsOf('old')).toBeDefined());
    expect(llm.generateTags.mock.calls.map(([, item]) => item.id)).toEqual(['new', 'old']);
  });

  it('tags the open item first', async () => {
    const items = [
      makeItem({ id: 'new', timestamp: '2026-03-01T00:00:00.000Z' }),
      makeItem({ id: 'open', timestamp: '2026-01-01T00:00:00.000Z' }),
    ];
    setup(items);
    llm.generateTags.mockResolvedValue(tags('x'));
    renderHook(() => useAiTagging(items, 'open'));
    await waitFor(() => expect(llm.generateTags).toHaveBeenCalledTimes(2));
    expect(llm.generateTags.mock.calls[0]![1].id).toBe('open');
  });

  it('reports the item that is being tagged', async () => {
    const items = [makeItem({ id: 'a' })];
    setup(items);
    let finish!: (value: unknown) => void;
    llm.generateTags.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const { result } = renderHook(() => useAiTagging(items, undefined));
    await waitFor(() => expect(result.current).toBe('a'));
    await act(async () => finish(tags('x')));
    await waitFor(() => expect(result.current).toBeUndefined());
  });

  it('skips tagged, forgotten and empty items', async () => {
    const items = [
      makeItem({ id: 'tagged', aiTags: { tags: ['x'], createdAt: '2026-01-01T00:00:00.000Z' } }),
      makeItem({ id: 'forgotten', mark: 'forgotten' }),
      makeItem({ id: 'empty', content: '   ' }),
      makeItem({ id: 'todo' }),
    ];
    setup(items);
    llm.generateTags.mockResolvedValue(tags('x'));
    renderHook(() => useAiTagging(items, undefined));
    await waitFor(() => expect(llm.generateTags).toHaveBeenCalledTimes(1));
    expect(llm.generateTags.mock.calls[0]![1].id).toBe('todo');
  });

  it('does nothing when "Use LLM for tagging" is off', async () => {
    const items = [makeItem({ id: 'a' })];
    setup(items, { useForTags: false });
    renderHook(() => useAiTagging(items, undefined));
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(llm.listModels).not.toHaveBeenCalled();
    expect(llm.generateTags).not.toHaveBeenCalled();
  });

  it('does not ask for the permission, and waits, when the extension has none', async () => {
    const items = [makeItem({ id: 'a' })];
    setup(items);
    llm.hasLlmPermission.mockResolvedValue(false);
    renderHook(() => useAiTagging(items, undefined));
    await waitFor(() => expect(llm.hasLlmPermission).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(llm.requestLlmPermission).not.toHaveBeenCalled();
    expect(llm.generateTags).not.toHaveBeenCalled();
  });

  it('waits when the server is not reachable', async () => {
    const items = [makeItem({ id: 'a' })];
    setup(items);
    llm.listModels.mockRejectedValue(new LlmError('down'));
    renderHook(() => useAiTagging(items, undefined));
    await waitFor(() => expect(llm.listModels).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(llm.generateTags).not.toHaveBeenCalled();
  });

  it('tries again after the pause, when the server is back', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const items = [makeItem({ id: 'a' })];
      setup(items);
      llm.listModels.mockRejectedValueOnce(new LlmError('down')).mockResolvedValue(['m']);
      llm.generateTags.mockResolvedValue(tags('back'));
      renderHook(() => useAiTagging(items, undefined));
      await vi.waitFor(() => expect(llm.listModels).toHaveBeenCalledTimes(1));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5 * 60_000 + 10);
      });
      await vi.waitFor(() => expect(tagsOf('a')).toEqual(['back']));
    } finally {
      vi.useRealTimers();
    }
  });

  it('skips an item whose tagging fails while the server answers, and goes on', async () => {
    const items = [
      makeItem({ id: 'bad', timestamp: '2026-03-01T00:00:00.000Z' }),
      makeItem({ id: 'good', timestamp: '2026-01-01T00:00:00.000Z' }),
    ];
    setup(items);
    llm.generateTags.mockImplementation(async (_s, item: SavedItem) => {
      if (item.id === 'bad') throw new LlmError('The LLM answer has no tags.');
      return tags('fine');
    });
    renderHook(() => useAiTagging(items, undefined));
    await waitFor(() => expect(tagsOf('good')).toEqual(['fine']));
    expect(tagsOf('bad')).toBeUndefined();
    // The failed item is not tried again in a loop.
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(llm.generateTags.mock.calls.filter(([, item]) => item.id === 'bad')).toHaveLength(1);
  });

  it('keeps tags that another dashboard tab saved first', async () => {
    const items = [makeItem({ id: 'a' })];
    setup(items);
    llm.generateTags.mockImplementation(async () => {
      fake.storage.local.store.set('item:a', {
        ...items[0]!,
        aiTags: { tags: ['other tab'], createdAt: '2026-02-01T00:00:00.000Z' },
      });
      return tags('mine');
    });
    renderHook(() => useAiTagging(items, undefined));
    await waitFor(() => expect(llm.generateTags).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(tagsOf('a')).toEqual(['other tab']);
  });

  it('tags a new item that arrives later', async () => {
    const first = makeItem({ id: 'first' });
    setup([first]);
    llm.generateTags.mockResolvedValue(tags('x'));
    const { rerender } = renderHook(({ items }) => useAiTagging(items, undefined), {
      initialProps: { items: [first] },
    });
    await waitFor(() => expect(tagsOf('first')).toBeDefined());

    const second = makeItem({ id: 'second' });
    fake.storage.local.store.set('item:second', second);
    rerender({ items: [second, first] });
    await waitFor(() => expect(tagsOf('second')).toBeDefined());
  });
});
