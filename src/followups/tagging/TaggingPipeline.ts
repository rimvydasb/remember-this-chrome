import { hasTopicTags } from '../../shared/tags';
import type { SavedItem } from '../../shared/types';
import { ItemDeletedError } from '../errors';
import type { FollowUpPipeline, PipelineContext } from '../pipeline';
import type { ItemStore } from '../ports';
import { generateTags } from './generateTags';

export interface TaggingDeps {
  store: Pick<ItemStore, 'setTags'>;
  generate?: typeof generateTags;
}

/** The AI topic tags of an item: generate with the LLM and save them on the item as `ai-topics` tags. */
export class TaggingPipeline implements FollowUpPipeline<{ onlyIfMissing?: boolean } | undefined> {
  readonly id = 'tagging';
  private readonly generate: typeof generateTags;

  constructor(private readonly deps: TaggingDeps) {
    this.generate = deps.generate ?? generateTags;
  }

  /** True when the item still needs topic tags. Forgotten and empty items are skipped. */
  needsTags(item: SavedItem): boolean {
    return !hasTopicTags(item) && item.mark !== 'forgotten' && item.content.trim() !== '';
  }

  /**
   * Generates and saves tags. With `onlyIfMissing`, tags that arrived meanwhile are kept and a
   * deleted item is ignored; otherwise a deleted item throws `ItemDeletedError`.
   */
  async run({ settings, item }: PipelineContext, options: { onlyIfMissing?: boolean } = {}): Promise<void> {
    const tags = await this.generate(settings, item);
    const saved = await this.deps.store.setTags(item.id, 'ai-topics', tags, options);
    if (!saved && !options.onlyIfMissing) throw new ItemDeletedError();
  }
}
