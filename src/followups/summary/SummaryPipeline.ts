import type { FollowUp, SavedItem } from '../../shared/types';
import { ItemDeletedError } from '../errors';
import type { FollowUpPipeline, PipelineContext } from '../pipeline';
import type { ItemStore } from '../ports';
import { createFollowUp, followUpsOfType } from '../../shared/followUpRecords';
import { generateSummary } from './generateSummary';

export interface SummaryDeps {
  store: Pick<ItemStore, 'addFollowUp' | 'deleteFollowUp'>;
  generate?: typeof generateSummary;
}

/**
 * The summary follow-up: generate with the LLM, save as an `llm-summary`, and drop the earlier
 * summaries, so an item has at most one.
 */
export class SummaryPipeline implements FollowUpPipeline<void, FollowUp> {
  readonly id = 'summary';
  private readonly generate: typeof generateSummary;

  constructor(private readonly deps: SummaryDeps) {
    this.generate = deps.generate ?? generateSummary;
  }

  /** The current summary of the item. */
  current(item: SavedItem): FollowUp | undefined {
    return followUpsOfType(item, 'llm-summary').at(-1);
  }

  /** Generates a new summary and replaces the earlier ones. Throws `ItemDeletedError` when the item is gone. */
  async run({ settings, item }: PipelineContext): Promise<FollowUp> {
    const previous = followUpsOfType(item, 'llm-summary');
    const result = await this.generate(settings, item);
    const followUp = createFollowUp('llm-summary', { generatedContent: result.content });
    if (result.model) followUp.model = result.model;
    if (!(await this.deps.store.addFollowUp(item.id, followUp))) throw new ItemDeletedError();
    for (const old of previous) await this.deps.store.deleteFollowUp(item.id, old.id);
    return followUp;
  }

  remove(item: SavedItem, summary: FollowUp): Promise<void> {
    return this.deps.store.deleteFollowUp(item.id, summary.id);
  }
}
