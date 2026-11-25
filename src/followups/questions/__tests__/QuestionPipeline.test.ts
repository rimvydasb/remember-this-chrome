import { describe, expect, it, vi } from 'vitest';
import { createFollowUp } from '../../../shared/followUpRecords';
import { DEFAULT_SETTINGS } from '../../../shared/settings';
import { createFakeStore } from '../../../test/fakeStore';
import { makeItem } from '../../../test/items';
import { ItemDeletedError } from '../../errors';
import { QuestionPipeline } from '../QuestionPipeline';

const settings = DEFAULT_SETTINGS.llm;

describe('QuestionPipeline', () => {
  it('saves a trimmed question without an answer', async () => {
    const store = createFakeStore();
    const item = makeItem();
    const question = await new QuestionPipeline({ store }).ask(item, '  Why?  ');

    expect(question).toMatchObject({ type: 'user-question', userContent: 'Why?', generatedContent: '' });
    expect(store.followUps).toEqual([{ itemId: item.id, followUp: question }]);
  });

  it('throws ItemDeletedError when the item is gone', async () => {
    const pipeline = new QuestionPipeline({ store: createFakeStore(() => false) });
    await expect(pipeline.ask(makeItem(), 'Why?')).rejects.toBeInstanceOf(ItemDeletedError);
  });

  it('answers a saved question and stores the answer with the model', async () => {
    const store = createFakeStore();
    const generate = vi.fn(async () => ({ content: 'Because.', model: 'm1' }));
    const pipeline = new QuestionPipeline({ store, generate });
    const item = makeItem();
    const question = await pipeline.ask(item, 'Why?');

    await pipeline.run({ settings, item }, question);

    expect(generate).toHaveBeenCalledWith(settings, item, { text: 'Why?', id: question.id });
    expect(store.followUps[0]!.followUp).toMatchObject({ generatedContent: 'Because.', model: 'm1' });
  });

  it('leaves the question unanswered when the generation fails', async () => {
    const store = createFakeStore();
    const pipeline = new QuestionPipeline({
      store,
      generate: async () => {
        throw new Error('offline');
      },
    });
    const item = makeItem();
    const question = await pipeline.ask(item, 'Why?');

    await expect(pipeline.run({ settings, item }, question)).rejects.toThrow('offline');
    expect(store.followUps[0]!.followUp.generatedContent).toBe('');
  });

  it('does not call the LLM for a question without text', async () => {
    const generate = vi.fn();
    const pipeline = new QuestionPipeline({ store: createFakeStore(), generate });
    await pipeline.run({ settings, item: makeItem() }, createFollowUp('user-question'));
    expect(generate).not.toHaveBeenCalled();
  });

  it('lists the questions newest first, ignoring other follow-ups', () => {
    const a = createFollowUp('user-question', { userContent: 'A' });
    const b = createFollowUp('user-question', { userContent: 'B' });
    const summary = createFollowUp('llm-summary');
    const item = makeItem({ followUps: [a, summary, b] });
    expect(new QuestionPipeline({ store: createFakeStore() }).list(item)).toEqual([b, a]);
  });

  it('removes a question', async () => {
    const store = createFakeStore();
    const item = makeItem();
    const pipeline = new QuestionPipeline({ store });
    const question = await pipeline.ask(item, 'Why?');
    await pipeline.remove(item, question);
    expect(store.followUps).toEqual([]);
  });
});
