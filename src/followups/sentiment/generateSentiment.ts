import { LlmClient, LlmError, type LlmOptions, type LlmResult } from '../../llm';
import { formatSentiments, parseSentiments } from '../../shared/sentiment';
import type { SavedItem } from '../../shared/types';
import type { LlmSettings } from '../../shared/settings';
import { buildSentimentMessage } from './prompt';

/**
 * Finds the sentiments of an item with the configured model. The content of the result is the
 * labels of the vocabulary, comma-separated. Throws `LlmError` when the answer has none.
 */
export async function generateSentiment(
  settings: LlmSettings,
  item: Pick<SavedItem, 'title' | 'content' | 'meta'>,
  options: LlmOptions = {},
): Promise<LlmResult> {
  const result = await new LlmClient(settings, options).complete(buildSentimentMessage(item), { temperature: 0.1 });
  const sentiments = parseSentiments(result.content);
  if (sentiments.length === 0) throw new LlmError('The LLM answer has no known sentiment.');
  return { ...result, content: formatSentiments(sentiments) };
}
