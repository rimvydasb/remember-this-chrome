import { LlmClient, LlmError, type LlmOptions } from '../../llm';
import type { LlmSettings } from '../../shared/settings';
import { createTags } from '../../shared/tags';
import type { SavedItem, Tag } from '../../shared/types';
import { parseTags } from './parseTags';
import { buildTagMessage } from './prompt';

/** Generates the topic tags of an item with the configured model, most relevant first. */
export async function generateTags(
  settings: LlmSettings,
  item: Pick<SavedItem, 'title' | 'content' | 'meta'>,
  options: LlmOptions = {},
): Promise<Tag[]> {
  const result = await new LlmClient(settings, options).complete(buildTagMessage(item), { temperature: 0.2 });
  const tags = createTags('ai-topics', parseTags(result.content), { model: result.model });
  if (tags.length === 0) throw new LlmError('The LLM answer has no tags.');
  return tags;
}
