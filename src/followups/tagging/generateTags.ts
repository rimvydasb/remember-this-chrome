import { LlmClient, LlmError, type LlmOptions } from '../../llm';
import type { LlmSettings } from '../../shared/settings';
import type { AiTags, SavedItem } from '../../shared/types';
import { parseTags } from './parseTags';
import { buildTagMessage } from './prompt';

/** Generates tags for an item with the configured model. */
export async function generateTags(
  settings: LlmSettings,
  item: Pick<SavedItem, 'title' | 'content' | 'meta'>,
  options: LlmOptions = {},
): Promise<AiTags> {
  const result = await new LlmClient(settings, options).complete(buildTagMessage(item), { temperature: 0.2 });
  const tags = parseTags(result.content);
  if (tags.length === 0) throw new LlmError('The LLM answer has no tags.');
  const aiTags: AiTags = { tags, createdAt: new Date().toISOString() };
  if (result.model) aiTags.model = result.model;
  return aiTags;
}
