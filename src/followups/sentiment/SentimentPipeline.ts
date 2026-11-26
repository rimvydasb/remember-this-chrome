import { tagsFrom } from '../../shared/tags';
import type { SavedItem, Tag } from '../../shared/types';
import { ItemDeletedError } from '../errors';
import type { FollowUpPipeline, PipelineContext } from '../pipeline';
import type { ItemStore } from '../ports';
import { generateSentiment } from './generateSentiment';

export interface SentimentDeps {
  store: Pick<ItemStore, 'setTags'>;
  generate?: typeof generateSentiment;
}

/**
 * The sentiment of an item: find 1 to 3 sentiments with the LLM and save them as `ai-sentiment`
 * tags, in place of the earlier ones. Other tags of the item are kept.
 */
export class SentimentPipeline implements FollowUpPipeline<void, Tag[]> {
  readonly id = 'sentiment';
  private readonly generate: typeof generateSentiment;

  constructor(private readonly deps: SentimentDeps) {
    this.generate = deps.generate ?? generateSentiment;
  }

  /** The current sentiment tags of the item; empty when it has none. */
  current(item: SavedItem): Tag[] {
    return tagsFrom(item, 'ai-sentiment');
  }

  /** Finds the sentiments and replaces the earlier ones. Throws `ItemDeletedError` when the item is gone. */
  async run({ settings, item }: PipelineContext): Promise<Tag[]> {
    const tags = await this.generate(settings, item);
    if (!(await this.deps.store.setTags(item.id, 'ai-sentiment', tags))) throw new ItemDeletedError();
    return tags;
  }

  async remove(item: SavedItem): Promise<void> {
    await this.deps.store.setTags(item.id, 'ai-sentiment', []);
  }
}
