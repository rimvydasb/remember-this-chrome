import { describe, expect, it, vi } from 'vitest';
import { LlmError } from '../../../llm';
import { SearchError, type SearchHit } from '../../../shared/googleSearch';
import { DEFAULT_SETTINGS } from '../../../shared/settings';
import { createFakeStore } from '../../../test/fakeStore';
import { makeItem, topicTags } from '../../../test/items';
import { ItemDeletedError } from '../../errors';
import { RelatedArticlesPipeline, RelatedSearchError, type RelatedProgress } from '../RelatedArticlesPipeline';

const settings = DEFAULT_SETTINGS.llm;
const hit = (url: string, rank: number): SearchHit => ({ url, title: `Title ${rank}`, rank });

function setup(options: {
  queries?: string[];
  generateError?: Error;
  search?: (query: string) => Promise<SearchHit[]>;
  exists?: boolean;
}) {
  const store = createFakeStore(() => options.exists ?? true);
  const generate = vi.fn(async () => {
    if (options.generateError) throw options.generateError;
    return { queries: options.queries ?? ['q1', 'q2'], model: 'qwen' };
  });
  const search = vi.fn(options.search ?? (async () => [hit('https://a.example/1', 1)]));
  const wait = vi.fn(async () => {});
  const pipeline = new RelatedArticlesPipeline({ store, generate, search, wait, random: () => 0.5 });
  return { store, generate, search, wait, pipeline };
}

describe('RelatedArticlesPipeline', () => {
  it('runs the LLM queries one at a time, spaced, and saves the merged articles', async () => {
    const { store, search, wait, pipeline } = setup({
      search: async (query) =>
        query.startsWith('q1')
          ? [hit('https://a.example/1', 1), hit('https://b.example/1', 2)]
          : [hit('https://b.example/1', 1)],
    });
    const progress: RelatedProgress[] = [];
    const item = makeItem({ type: 'youtube_transcript', url: 'https://www.youtube.com/watch?v=x' });
    const { followUp, aborted } = await pipeline.run({ settings, item }, { onProgress: (p) => progress.push(p) });

    expect(search.mock.calls.map(([query]) => query)).toEqual(['q1 -site:youtube.com', 'q2 -site:youtube.com']);
    expect(wait).toHaveBeenCalledOnce();
    expect(wait).toHaveBeenCalledWith(2250);
    expect(progress).toEqual([
      { step: 'queries' },
      { step: 'search', index: 1, total: 2 },
      { step: 'search', index: 2, total: 2 },
    ]);
    expect(aborted).toBeUndefined();
    expect(followUp).toMatchObject({
      type: 'related-articles',
      model: 'qwen',
      queries: ['q1 -site:youtube.com', 'q2 -site:youtube.com'],
    });
    expect(followUp.articles!.map((a) => a.url)).toEqual(['https://b.example/1', 'https://a.example/1']);
    expect(followUp.generatedContent).toBe('- [Title 2](<https://b.example/1>)\n- [Title 1](<https://a.example/1>)');
    expect(store.followUps).toEqual([{ itemId: item.id, followUp }]);
  });

  it('does not add the YouTube exclusion for page items and leaves out the page host', async () => {
    const { search, pipeline } = setup({
      queries: ['q1'],
      search: async () => [hit('https://www.example.com/self', 1), hit('https://other.example/', 2)],
    });
    const item = makeItem({ url: 'https://example.com/post' });
    const { followUp } = await pipeline.run({ settings, item });
    expect(search).toHaveBeenCalledWith('q1');
    expect(followUp.articles!.map((a) => a.url)).toEqual(['https://other.example/']);
  });

  it('falls back to title and tag queries when no LLM is reachable', async () => {
    const { search, pipeline } = setup({ generateError: new LlmError('Cannot reach the LLM server.') });
    const item = makeItem({
      title: 'Sleep and memory',
      tags: topicTags('sleep', 'hippocampus'),
    });
    const { followUp } = await pipeline.run({ settings, item });
    expect(search.mock.calls.map(([query]) => query)).toEqual(['Sleep and memory', 'sleep hippocampus']);
    expect(followUp.model).toBeUndefined();
  });

  it('stops at a blocking response and keeps what the earlier queries found', async () => {
    const { search, pipeline } = setup({
      queries: ['q1', 'q2', 'q3'],
      search: async (query) => {
        if (query === 'q2') throw new SearchError('captcha', 'bot check');
        return [hit('https://a.example/1', 1)];
      },
    });
    const { followUp, aborted } = await pipeline.run({ settings, item: makeItem() });
    expect(search).toHaveBeenCalledTimes(2);
    expect(aborted?.code).toBe('captcha');
    expect(followUp.queries).toEqual(['q1']);
  });

  it('throws a blocking RelatedSearchError with the queries when the first request is blocked', async () => {
    const { store, pipeline } = setup({
      search: async () => {
        throw new SearchError('rate-limited', 'HTTP 429');
      },
    });
    const error = await pipeline.run({ settings, item: makeItem() }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RelatedSearchError);
    expect((error as RelatedSearchError).blocking).toBe(true);
    expect((error as RelatedSearchError).queries).toEqual(['q1', 'q2']);
    expect(store.followUps).toEqual([]);
  });

  it('treats zero results on all queries as a blocking error', async () => {
    const { pipeline } = setup({ search: async () => [] });
    const error = (await pipeline.run({ settings, item: makeItem() }).catch((e: unknown) => e)) as RelatedSearchError;
    expect(error.searchError.code).toBe('no-results');
    expect(error.blocking).toBe(true);
  });

  it('throws ItemDeletedError when the item is gone, and lists searches newest first', async () => {
    const { pipeline } = setup({ exists: false });
    await expect(pipeline.run({ settings, item: makeItem() })).rejects.toBeInstanceOf(ItemDeletedError);

    const older = { id: 'o', type: 'related-articles' as const, generatedContent: '', createdAt: '2026-01-01' };
    const newer = { ...older, id: 'n' };
    expect(pipeline.list(makeItem({ followUps: [older, newer] })).map((f) => f.id)).toEqual(['n', 'o']);
  });
});
