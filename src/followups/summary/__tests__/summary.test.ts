import { describe, expect, it, vi } from 'vitest';
import { LlmError } from '../../../llm';
import { DEFAULT_SETTINGS, type LlmSettings } from '../../../shared/settings';
import { generateSummary } from '../generateSummary';
import { buildSummaryMessage } from '../prompt';

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
const src = { ...base, title: 't', content: 'x' };
const video = { ...base, title: 'My video', content: 'the transcript', meta: { channel: 'Chan' } };

describe('summary prompt', () => {
  it('appends title and transcript to a summary prompt without fields', () => {
    expect(buildSummaryMessage('Short.', video)).toBe('Short.\n\nTitle: My video\n\nTranscript:\nthe transcript');
    expect(buildSummaryMessage('{{transcript}} by {{channel}}', video)).toBe('the transcript by Chan');
  });

  it('builds the summary message from the default template', () => {
    expect(buildSummaryMessage(settings.summaryPrompt, video)).toMatch(
      /^Transcript:\nthe transcript\n\nTitle: My video\nChannel: Chan\n\nTask:\nSummarize/,
    );
    expect(buildSummaryMessage(settings.summaryPrompt, src)).toMatch(/Title: t\n\nTask:/);
  });

  it('reports a template syntax error as an LlmError', () => {
    expect(() => buildSummaryMessage('{{#questions}}open', video)).toThrow(LlmError);
    expect(() => buildSummaryMessage('{{#questions}}open', video)).toThrow(/summary prompt .* template error/);
  });
});

describe('generateSummary', () => {
  it('sends the summary prompt built from the template', async () => {
    const fetch = vi.fn(async () => completion('Main idea.'));
    expect(await generateSummary(settings, video, { fetch })).toEqual({ content: 'Main idea.', model: 'qwen3-8b' });
    const init = (fetch.mock.calls[0]! as unknown as [string, RequestInit])[1];
    expect(JSON.parse(init.body as string).messages).toEqual([
      { role: 'user', content: buildSummaryMessage(settings.summaryPrompt, video) },
    ]);
  });

  it('removes a reasoning block from the answer', async () => {
    const fetch = vi.fn(async () => completion('<think>hmm\nok</think>\n\nThe summary.'));
    expect((await generateSummary(settings, src, { fetch })).content).toBe('The summary.');
  });
});
