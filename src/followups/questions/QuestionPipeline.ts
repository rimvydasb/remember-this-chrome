import type { FollowUp, SavedItem } from '../../shared/types';
import { ItemDeletedError } from '../errors';
import type { FollowUpPipeline, PipelineContext } from '../pipeline';
import type { ItemStore } from '../ports';
import { createFollowUp, followUpsOfType } from '../../shared/followUpRecords';
import { generateAnswer } from './generateAnswer';

export interface QuestionDeps {
  store: Pick<ItemStore, 'addFollowUp' | 'updateFollowUp' | 'deleteFollowUp'>;
  generate?: typeof generateAnswer;
}

/**
 * The question follow-up. A question is saved first (`ask`) and answered right after (`run`),
 * so it survives a failed answer and can be answered again.
 */
export class QuestionPipeline implements FollowUpPipeline<FollowUp> {
  readonly id = 'question';
  private readonly generate: typeof generateAnswer;

  constructor(private readonly deps: QuestionDeps) {
    this.generate = deps.generate ?? generateAnswer;
  }

  /** The questions of the item, newest first. */
  list(item: SavedItem): FollowUp[] {
    return followUpsOfType(item, 'user-question').reverse();
  }

  /** Saves a question without an answer. Throws `ItemDeletedError` when the item is gone. */
  async ask(item: SavedItem, text: string): Promise<FollowUp> {
    const followUp = createFollowUp('user-question', { userContent: text.trim() });
    if (!(await this.deps.store.addFollowUp(item.id, followUp))) throw new ItemDeletedError();
    return followUp;
  }

  /**
   * Generates the answer of a saved question and stores it. When the question or the item was
   * deleted meanwhile, the answer is dropped.
   */
  async run({ settings, item }: PipelineContext, question: FollowUp): Promise<void> {
    const text = question.userContent?.trim();
    if (!text) return;
    const result = await this.generate(settings, item, { text, id: question.id });
    const patch: Partial<FollowUp> = { generatedContent: result.content };
    if (result.model) patch.model = result.model;
    await this.deps.store.updateFollowUp(item.id, question.id, patch);
  }

  remove(item: SavedItem, question: FollowUp): Promise<void> {
    return this.deps.store.deleteFollowUp(item.id, question.id);
  }
}
