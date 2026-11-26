import { createFollowUp, followUpsOfType } from '../../shared/followUpRecords';
import type { FollowUp, SavedItem } from '../../shared/types';
import { ItemDeletedError } from '../errors';
import type { FollowUpPipeline, PipelineContext } from '../pipeline';
import type { ItemStore } from '../ports';
import { generateSentiment } from './generateSentiment';

export interface SentimentDeps {
  store: Pick<ItemStore, 'addFollowUp' | 'deleteFollowUp'>;
  generate?: typeof generateSentiment;
}

/**
 * The sentiment follow-up: find 1 to 3 sentiments with the LLM, save them as an `llm-sentiment`,
 * and drop the earlier ones, so an item has at most one.
 */
export class SentimentPipeline implements FollowUpPipeline<void, FollowUp> {
  readonly id = 'sentiment';
  private readonly generate: typeof generateSentiment;

  constructor(private readonly deps: SentimentDeps) {
    this.generate = deps.generate ?? generateSentiment;
  }

  /** The current sentiment of the item. */
  current(item: SavedItem): FollowUp | undefined {
    return followUpsOfType(item, 'llm-sentiment').at(-1);
  }

  /** Finds the sentiments and replaces the earlier ones. Throws `ItemDeletedError` when the item is gone. */
  async run({ settings, item }: PipelineContext): Promise<FollowUp> {
    const previous = followUpsOfType(item, 'llm-sentiment');
    const result = await this.generate(settings, item);
    const followUp = createFollowUp('llm-sentiment', { generatedContent: result.content });
    if (result.model) followUp.model = result.model;
    if (!(await this.deps.store.addFollowUp(item.id, followUp))) throw new ItemDeletedError();
    for (const old of previous) await this.deps.store.deleteFollowUp(item.id, old.id);
    return followUp;
  }

  remove(item: SavedItem, sentiment: FollowUp): Promise<void> {
    return this.deps.store.deleteFollowUp(item.id, sentiment.id);
  }
}
