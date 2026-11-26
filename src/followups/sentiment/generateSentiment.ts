import { LlmClient, LlmError, type LlmOptions } from '../../llm';
import { parseSentiments } from '../../shared/sentiment';
import type { LlmSettings } from '../../shared/settings';
import { createTags } from '../../shared/tags';
import type { SavedItem, Tag } from '../../shared/types';
import { buildSentimentMessage } from './prompt';

/**
 * Finds the sentiments of an item with the configured model: 1 to 3 labels of the vocabulary, as
 * `ai-sentiment` tags in the order the model gave them. Throws `LlmError` when the answer has none.
 */
export async function generateSentiment(
  settings: LlmSettings,
  item: Pick<SavedItem, 'title' | 'content' | 'meta'>,
  options: LlmOptions = {},
): Promise<Tag[]> {
  const result = await new LlmClient(settings, options).complete(buildSentimentMessage(item), { temperature: 0.1 });
  const labels = parseSentiments(result.content).map((sentiment) => sentiment.label);
  if (labels.length === 0) throw new LlmError('The LLM answer has no known sentiment.');
  return createTags('ai-sentiment', labels, { model: result.model });
}
