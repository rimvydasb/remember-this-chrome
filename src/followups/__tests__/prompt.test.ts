import { describe, expect, it } from 'vitest';
import { LlmError } from '../../llm';
import { buildPromptModel } from '../../shared/promptModel';
import { makeItem } from '../../test/items';
import { renderTemplate } from '../prompt';

describe('renderTemplate', () => {
  it('renders the template with the model of the item', () => {
    const item = makeItem({ title: 'T', content: 'Body' });
    expect(renderTemplate('{{title}}: {{transcript}}', buildPromptModel(item), 'summary')).toBe('T: Body');
  });

  it('reports a template error as an LlmError that names the prompt', () => {
    const model = buildPromptModel(makeItem());
    expect(() => renderTemplate('{{#open}}', model, 'question')).toThrow(LlmError);
    expect(() => renderTemplate('{{#open}}', model, 'question')).toThrow(/question prompt .* template error/);
  });
});
