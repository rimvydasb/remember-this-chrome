import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../../../shared/settings';
import type { AiTags } from '../../../shared/types';
import { createFakeStore } from '../../../test/fakeStore';
import { makeItem } from '../../../test/items';
import { ItemDeletedError } from '../../errors';
import { TaggingPipeline } from '../TaggingPipeline';

const settings = DEFAULT_SETTINGS.llm;
const aiTags: AiTags = { tags: ['a', 'b'], createdAt: '2026-02-01T00:00:00.000Z', model: 'm' };
const generate = vi.fn(async () => aiTags);

describe('TaggingPipeline', () => {
  it('generates tags and saves them on the item', async () => {
    const store = createFakeStore();
    const item = makeItem();
    await new TaggingPipeline({ store, generate }).run({ settings, item });
    expect(generate).toHaveBeenCalledWith(settings, item);
    expect(store.tags.get(item.id)).toEqual(aiTags);
  });

  it('throws ItemDeletedError for a deleted item, unless tagging is optional', async () => {
    const pipeline = new TaggingPipeline({ store: createFakeStore(() => false), generate });
    const item = makeItem();
    await expect(pipeline.run({ settings, item })).rejects.toBeInstanceOf(ItemDeletedError);
    await expect(pipeline.run({ settings, item }, { onlyIfMissing: true })).resolves.toBeUndefined();
  });

  it('keeps tags that arrived meanwhile when onlyIfMissing is set', async () => {
    const store = createFakeStore();
    const item = makeItem();
    store.tags.set(item.id, { tags: ['first'], createdAt: aiTags.createdAt });
    await new TaggingPipeline({ store, generate }).run({ settings, item }, { onlyIfMissing: true });
    expect(store.tags.get(item.id)!.tags).toEqual(['first']);
  });

  it('needs tags for items without AI tags, except forgotten and empty ones', () => {
    const pipeline = new TaggingPipeline({ store: createFakeStore(), generate });
    expect(pipeline.needsTags(makeItem())).toBe(true);
    expect(pipeline.needsTags(makeItem({ aiTags }))).toBe(false);
    expect(pipeline.needsTags(makeItem({ mark: 'forgotten' }))).toBe(false);
    expect(pipeline.needsTags(makeItem({ content: '  ' }))).toBe(false);
  });
});
