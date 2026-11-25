import type { LlmSettings } from '../shared/settings';
import type { SavedItem } from '../shared/types';

/** What every pipeline needs to run: the LLM to call and the item to work on. */
export interface PipelineContext {
  settings: LlmSettings;
  item: SavedItem;
}

/**
 * One kind of follow-up work on an item, as a chain of steps: build the prompt, call the LLM,
 * check the answer, save the result. A pipeline owns its prompt, its parsing and its writes to
 * the library; it knows nothing about the UI. A new follow-up implements this interface, adds a
 * folder next to `summary/`, and is wired in `services.ts`.
 *
 * - `TInput` is what the caller adds to the context (for example the question to answer).
 * - `TOutput` is what the caller gets back (for example the saved follow-up).
 */
export interface FollowUpPipeline<TInput = void, TOutput = void> {
  /** Stable name of the pipeline, for logs and registries. */
  readonly id: string;
  run(context: PipelineContext, input: TInput): Promise<TOutput>;
}
