import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../../../shared/settings';
import { createFakeStore } from '../../../test/fakeStore';
import { makeItem, sentimentTags, topicTags } from '../../../test/items';
import { ItemDeletedError } from '../../errors';
import { SentimentPipeline } from '../SentimentPipeline';

const settings = DEFAULT_SETTINGS.llm;

describe('SentimentPipeline', () => {
  it('saves the generated sentiments as ai-sentiment tags', async () => {
    const store = createFakeStore();
    const tags = sentimentTags('bullish', 'calm');
    const generate = vi.fn(async () => tags);
    const item = makeItem();
    const saved = await new SentimentPipeline({ store, generate }).run({ settings, item });

    expect(generate).toHaveBeenCalledWith(settings, item);
    expect(saved).toBe(tags);
    expect(store.setTags).toHaveBeenCalledWith(item.id, 'ai-sentiment', tags);
  });

  it('replaces only the sentiment tags of the item', async () => {
    const store = createFakeStore();
    const item = makeItem();
    store.tags.set(
      item.id,
      new Map([
        ['ai-topics', topicTags('sleep')],
        ['ai-sentiment', sentimentTags('bearish')],
      ]),
    );
    await new SentimentPipeline({ store, generate: async () => sentimentTags('bullish') }).run({ settings, item });

    const own = store.tags.get(item.id)!;
    expect(own.get('ai-sentiment')!.map((tag) => tag.label)).toEqual(['bullish']);
    expect(own.get('ai-topics')!.map((tag) => tag.label)).toEqual(['sleep']);
  });

  it('keeps the old sentiment when the generation fails', async () => {
    const store = createFakeStore();
    const pipeline = new SentimentPipeline({
      store,
      generate: async () => {
        throw new Error('offline');
      },
    });
    await expect(pipeline.run({ settings, item: makeItem() })).rejects.toThrow('offline');
    expect(store.setTags).not.toHaveBeenCalled();
  });

  it('throws ItemDeletedError when the item is gone', async () => {
    const pipeline = new SentimentPipeline({
      store: createFakeStore(() => false),
      generate: async () => sentimentTags('calm'),
    });
    await expect(pipeline.run({ settings, item: makeItem() })).rejects.toBeInstanceOf(ItemDeletedError);
  });

  it('finds the current sentiment and removes it', async () => {
    const store = createFakeStore();
    const item = makeItem({ tags: [...topicTags('sleep'), ...sentimentTags('bearish', 'calm')] });
    const pipeline = new SentimentPipeline({ store });

    expect(pipeline.current(item).map((tag) => tag.label)).toEqual(['bearish', 'calm']);
    expect(pipeline.current(makeItem())).toEqual([]);
    await pipeline.remove(item);
    expect(store.setTags).toHaveBeenCalledWith(item.id, 'ai-sentiment', []);
  });
});
