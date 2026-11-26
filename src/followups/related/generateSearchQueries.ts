import { LlmClient, LlmError, type LlmOptions } from '../../llm';
import type { PromptItem } from '../../shared/promptModel';
import type { LlmSettings } from '../../shared/settings';
import { parseQueries } from './parseQueries';
import { buildQueryMessage } from './prompt';

export interface GeneratedQueries {
  queries: string[];
  /** The model that wrote the queries. */
  model?: string;
}

/** Asks the configured model for 3 to 5 search queries about the item. Throws `LlmError` when it gives none. */
export async function generateSearchQueries(
  settings: LlmSettings,
  item: PromptItem,
  options: LlmOptions = {},
): Promise<GeneratedQueries> {
  const result = await new LlmClient(settings, options).complete(buildQueryMessage(item), { temperature: 0.3 });
  const queries = parseQueries(result.content);
  if (queries.length === 0) throw new LlmError('The LLM answer has no search queries.');
  return result.model ? { queries, model: result.model } : { queries };
}
