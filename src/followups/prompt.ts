import { LlmError } from '../llm';
import { PromptTemplateError, renderPrompt, type PromptKind, type PromptModel } from '../shared/promptModel';

/** Renders a prompt template; a template error becomes an `LlmError` that names the setting. */
export function renderTemplate(template: string, model: PromptModel, kind: PromptKind): string {
  try {
    return renderPrompt(template, model, kind);
  } catch (error) {
    if (error instanceof PromptTemplateError) {
      throw new LlmError(`The ${kind} prompt in Settings has a template error: ${error.message}`);
    }
    throw error;
  }
}
