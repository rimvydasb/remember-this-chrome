import { buildPromptModel, type PromptItem } from '../../shared/promptModel';
import { renderTemplate } from '../prompt';

/** Builds the summary request from the summary prompt template. */
export function buildSummaryMessage(template: string, item: PromptItem): string {
  return renderTemplate(template, buildPromptModel(item), 'summary');
}
