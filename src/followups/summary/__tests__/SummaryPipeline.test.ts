import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../../../shared/settings';
import { createFollowUp } from '../../../shared/followUpRecords';
import { createFakeStore } from '../../../test/fakeStore';
import { makeItem } from '../../../test/items';
import { ItemDeletedError } from '../../errors';
import { SummaryPipeline } from '../SummaryPipeline';

const settings = DEFAULT_SETTINGS.llm;

describe('SummaryPipeline', () => {
  it('saves the generated summary as an llm-summary follow-up', async () => {
    const store = createFakeStore();
    const generate = vi.fn(async () => ({ content: 'Short.', model: 'm1' }));
    const item = makeItem();
    const saved = await new SummaryPipeline({ store, generate }).run({ settings, item });

    expect(generate).toHaveBeenCalledWith(settings, item);
    expect(saved).toMatchObject({ type: 'llm-summary', generatedContent: 'Short.', model: 'm1' });
    expect(store.followUps).toEqual([{ itemId: item.id, followUp: saved }]);
  });

  it('omits the model when the server did not report one', async () => {
    const generate = vi.fn(async () => ({ content: 'Short.' }));
    const saved = await new SummaryPipeline({ store: createFakeStore(), generate }).run({
      settings,
      item: makeItem(),
    });
    expect(saved).not.toHaveProperty('model');
  });

  it('replaces the earlier summaries and keeps other follow-ups', async () => {
    const store = createFakeStore();
    const oldSummary = createFollowUp('llm-summary', { generatedContent: 'Old.' });
    const question = createFollowUp('user-question', { userContent: 'Why?' });
    const item = makeItem({ followUps: [oldSummary, question] });
    store.followUps.push({ itemId: item.id, followUp: oldSummary }, { itemId: item.id, followUp: question });

    const pipeline = new SummaryPipeline({ store, generate: async () => ({ content: 'New.' }) });
    const saved = await pipeline.run({ settings, item });

    expect(store.followUps.map((e) => e.followUp.id)).toEqual([question.id, saved.id]);
  });

  it('keeps the old summary when the generation fails', async () => {
    const store = createFakeStore();
    const oldSummary = createFollowUp('llm-summary', { generatedContent: 'Old.' });
    const item = makeItem({ followUps: [oldSummary] });
    store.followUps.push({ itemId: item.id, followUp: oldSummary });

    const pipeline = new SummaryPipeline({
      store,
      generate: async () => {
        throw new Error('offline');
      },
    });
    await expect(pipeline.run({ settings, item })).rejects.toThrow('offline');
    expect(store.followUps).toHaveLength(1);
  });

  it('throws ItemDeletedError when the item is gone', async () => {
    const pipeline = new SummaryPipeline({
      store: createFakeStore(() => false),
      generate: async () => ({ content: 'x' }),
    });
    await expect(pipeline.run({ settings, item: makeItem() })).rejects.toBeInstanceOf(ItemDeletedError);
  });

  it('finds the current summary and removes it', async () => {
    const store = createFakeStore();
    const first = createFollowUp('llm-summary', { generatedContent: 'A' });
    const second = createFollowUp('llm-summary', { generatedContent: 'B' });
    const item = makeItem({ followUps: [first, second] });
    const pipeline = new SummaryPipeline({ store });

    expect(pipeline.current(item)).toBe(second);
    expect(pipeline.current(makeItem())).toBeUndefined();
    await pipeline.remove(item, second);
    expect(store.deleteFollowUp).toHaveBeenCalledWith(item.id, second.id);
  });
});
