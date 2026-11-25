import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, type LlmSettings } from '../../../shared/settings';
import { generateAnswer } from '../generateAnswer';
import { buildQuestionMessage } from '../prompt';

const settings: LlmSettings = { ...DEFAULT_SETTINGS.llm };

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const completion = (content: string, model = 'qwen3-8b') =>
  jsonResponse({ model, choices: [{ message: { content } }] });

const base = {
  url: 'https://www.youtube.com/watch?v=a',
  type: 'youtube_transcript' as const,
  timestamp: '2026-01-01T00:00:00.000Z',
};
const video = { ...base, title: 'My video', content: 'the transcript', meta: { channel: 'Chan' } };

describe('question prompt', () => {
  it('builds the question message from the default template', () => {
    const message = buildQuestionMessage(settings.questionPrompt, video, '  Why?  ');
    expect(message).toMatch(/^Transcript:\nthe transcript\n/);
    expect(message).toContain('Question: Why?\n');
    expect(message).not.toContain('{{');
  });

  it('appends the transcript and the question when the template uses no fields', () => {
    expect(buildQuestionMessage('Answer.', video, 'Why?')).toBe(
      'Answer.\n\nTitle: My video\n\nTranscript:\nthe transcript\n\nQuestion: Why?',
    );
  });
});

describe('generateAnswer', () => {
  it('answers a question with the configured model', async () => {
    const fetch = vi.fn(async () => completion('Because.'));
    expect(await generateAnswer(settings, video, { text: 'Why?' }, { fetch })).toEqual({
      content: 'Because.',
      model: 'qwen3-8b',
    });
    const init = (fetch.mock.calls[0]! as unknown as [string, RequestInit])[1];
    expect(JSON.parse(init.body as string).messages[0].content).toBe(
      buildQuestionMessage(settings.questionPrompt, video, 'Why?'),
    );
  });
});
