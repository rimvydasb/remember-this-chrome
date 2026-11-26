import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, type LlmSettings } from '../../../shared/settings';
import { generateSentiment } from '../generateSentiment';
import { buildSentimentMessage, SENTIMENT_PROMPT } from '../prompt';

const settings: LlmSettings = { ...DEFAULT_SETTINGS.llm };
const item = { title: 'Markets this week', content: 'Stocks rallied.', meta: { channel: 'Money TV' } };

const completion = (content: string, model = 'qwen3-8b') =>
  new Response(JSON.stringify({ model, choices: [{ message: { content } }] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

afterEach(() => vi.unstubAllGlobals());

describe('buildSentimentMessage', () => {
  it('lists the vocabulary and adds the item', () => {
    expect(SENTIMENT_PROMPT).toContain('cautiously bullish');
    expect(SENTIMENT_PROMPT).toContain('Market (');
    const message = buildSentimentMessage(item);
    expect(message).toContain('Title: Markets this week');
    expect(message).toContain('Channel: Money TV');
    expect(message).toContain('Content:\nStocks rallied.');
  });
});

describe('generateSentiment', () => {
  it('keeps the known labels of the answer, normalized', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => completion('Cautious Bullish, optimistic, whatever')),
    );
    const tags = await generateSentiment(settings, item);
    expect(tags.map((tag) => tag.label)).toEqual(['cautiously bullish', 'optimistic']);
    expect(tags[0]).toMatchObject({ kind: 'sentiment', source: 'ai-sentiment', model: 'qwen3-8b' });
  });

  it('fails when the answer has no known sentiment', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => completion('I cannot tell.')),
    );
    await expect(generateSentiment(settings, item)).rejects.toThrow('no known sentiment');
  });
});
