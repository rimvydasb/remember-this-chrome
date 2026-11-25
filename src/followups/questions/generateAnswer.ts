import { LlmClient, type LlmOptions, type LlmResult } from '../../llm';
import type { PromptItem } from '../../shared/promptModel';
import type { LlmSettings } from '../../shared/settings';
import { buildQuestionMessage } from './prompt';

/** Answers a question about an item with the configured local model, from the item text only. */
export function generateAnswer(
  settings: LlmSettings,
  item: PromptItem,
  question: { text: string; id?: string },
  options: LlmOptions = {},
): Promise<LlmResult> {
  return new LlmClient(settings, options).complete(
    buildQuestionMessage(settings.questionPrompt, item, question.text, question.id),
  );
}
