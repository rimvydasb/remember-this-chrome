import { buildPromptModel, type PromptItem } from '../../shared/promptModel';
import { renderTemplate } from '../prompt';

/**
 * Builds the question request from the question prompt template. `questionId` is the follow-up of
 * the question when it is already saved; it is left out of `{{questions}}`.
 */
export function buildQuestionMessage(
  template: string,
  item: PromptItem,
  question: string,
  questionId?: string,
): string {
  return renderTemplate(template, buildPromptModel(item, { question, questionId }), 'question');
}
