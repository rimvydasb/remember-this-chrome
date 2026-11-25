import { LlmClient, type LlmOptions, type LlmResult } from '../../llm';
import type { PromptItem } from '../../shared/promptModel';
import type { LlmSettings } from '../../shared/settings';
import { buildSummaryMessage } from './prompt';

/** Summarizes an item with the configured local model. */
export function generateSummary(settings: LlmSettings, item: PromptItem, options: LlmOptions = {}): Promise<LlmResult> {
  return new LlmClient(settings, options).complete(buildSummaryMessage(settings.summaryPrompt, item));
}
