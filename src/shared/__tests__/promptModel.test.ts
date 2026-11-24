import { describe, expect, it } from 'vitest';
import { buildPromptModel, PromptTemplateError, renderPrompt, templateFields, validateTemplate } from '../promptModel';
import type { SavedItem } from '../types';

const item: SavedItem = {
  id: 'a',
  title: 'Talk',
  url: 'https://www.youtube.com/watch?v=a',
  type: 'youtube_transcript',
  content: 'The text.',
  timestamp: '2026-03-04T10:00:00.000Z',
  meta: {
    channel: 'Chan',
    durationSec: 3723,
    description: ' About it. ',
    chapters: [{ startSec: 65, title: 'Intro' }],
    links: [{ url: 'https://x.dev' }, { url: 'https://y.dev', label: 'Docs' }],
  },
  aiTags: { tags: ['AI', 'code'], createdAt: '2026-03-05T00:00:00.000Z' },
  followUps: [
    { id: 's1', type: 'llm-summary', generatedContent: 'Old.', createdAt: '2026-03-05T00:00:00.000Z' },
    { id: 's2', type: 'llm-summary', generatedContent: 'New summary.', createdAt: '2026-03-06T00:00:00.000Z' },
    {
      id: 'q1',
      type: 'user-question',
      userContent: 'Why?',
      generatedContent: 'Because.',
      createdAt: '2026-03-07T00:00:00.000Z',
      model: 'm',
    },
    {
      id: 'q2',
      type: 'user-question',
      userContent: 'Pending?',
      generatedContent: '',
      createdAt: '2026-03-08T00:00:00.000Z',
    },
  ],
};

describe('buildPromptModel', () => {
  it('maps the item to the template model', () => {
    expect(buildPromptModel(item)).toEqual({
      title: 'Talk',
      url: item.url,
      kind: 'video',
      isVideo: true,
      channel: 'Chan',
      language: '',
      duration: '1:02:03',
      savedAt: '2026-03-04',
      description: 'About it.',
      transcript: 'The text.',
      summary: 'New summary.',
      tags: ['AI', 'code'],
      links: [
        { url: 'https://x.dev', label: '' },
        { url: 'https://y.dev', label: 'Docs' },
      ],
      chapters: [{ time: '1:05', title: 'Intro' }],
      questions: [{ question: 'Why?', answer: 'Because.', model: 'm', askedAt: '2026-03-07' }],
      question: '',
    });
  });

  it('sets the question and leaves the question being answered out of the list', () => {
    const model = buildPromptModel(item, { question: ' Again? ', questionId: 'q1' });
    expect(model.question).toBe('Again?');
    expect(model.questions).toEqual([]);
  });
});

describe('renderPrompt', () => {
  const model = buildPromptModel(item, { question: 'Now?' });

  it('renders values without HTML escaping, sections and inverted sections', () => {
    const template = [
      'Q: {{question}} <{{title}}> & "{{channel}}"',
      '{{#questions}}',
      '- {{question}} => {{answer}}',
      '{{/questions}}',
      '{{#summary}}S: {{summary}}{{/summary}}',
      '{{^language}}no language{{/language}}',
      '{{#tags}}[{{.}}]{{/tags}} {{#links}}{{url}}({{label}}) {{/links}}',
    ].join('\n');
    expect(renderPrompt(template, { ...model, title: 'a < b & c' }, 'question')).toBe(
      [
        'Q: Now? <a < b & c> & "Chan"',
        '- Why? => Because.',
        'S: New summary.',
        'no language',
        '[AI][code] https://x.dev() https://y.dev(Docs)',
      ].join('\n'),
    );
  });

  it('appends title, transcript and question to a template without fields', () => {
    expect(renderPrompt(' Answer. ', model, 'question')).toBe(
      'Answer.\n\nTitle: Talk\n\nTranscript:\nThe text.\n\nQuestion: Now?',
    );
    expect(renderPrompt('Sum.', model, 'summary')).toBe('Sum.\n\nTitle: Talk\n\nTranscript:\nThe text.');
  });

  it('lists the fields a template uses and reports syntax errors', () => {
    expect([...templateFields('{{a}} {{#b}}{{c}}{{/b}} {{^d}}{{/d}} {{{e}}}')].sort()).toEqual([
      'a',
      'b',
      'c',
      'd',
      'e',
    ]);
    expect(() => validateTemplate('{{#b}}')).toThrow(PromptTemplateError);
    expect(() => validateTemplate('{{a}}')).not.toThrow();
  });
});
