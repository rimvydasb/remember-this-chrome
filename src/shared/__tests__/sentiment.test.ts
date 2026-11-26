import { describe, expect, it } from 'vitest';
import { findSentiment, formatSentiments, parseSentiments, SENTIMENTS } from '../sentiment';

const labels = (answer: string) => parseSentiments(answer).map((s) => s.label);

describe('sentiment vocabulary', () => {
  it('has unique labels and aliases', () => {
    const names = SENTIMENTS.flatMap((s) => [s.label, ...(s.aliases ?? [])]);
    expect(new Set(names).size).toBe(names.length);
  });

  it('finds labels ignoring case, hyphens and punctuation, and knows aliases', () => {
    expect(findSentiment('Cautiously-Bullish.')?.label).toBe('cautiously bullish');
    expect(findSentiment('cautious bullish')?.label).toBe('cautiously bullish');
    expect(findSentiment('"Bearish"')).toMatchObject({ category: 'market', mood: 'negative' });
    expect(findSentiment('Short-term bearish')).toMatchObject({
      label: 'short term bearish',
      mood: 'leaning-negative',
    });
    expect(findSentiment('near term bullish')?.label).toBe('short term bullish');
    expect(findSentiment('made up')).toBeUndefined();
  });
});

describe('parseSentiments', () => {
  it('reads comma-separated labels in order', () => {
    expect(labels('bullish, optimistic')).toEqual(['bullish', 'optimistic']);
    expect(labels('Sentiments:\n- alarming\n- negative')).toEqual(['alarming', 'negative']);
  });

  it('drops unknown labels and duplicates, and keeps at most 3', () => {
    expect(labels('bullish, spicy, Bullish, calm, angry, sad')).toEqual(['bullish', 'calm', 'angry']);
    expect(labels('nothing to say')).toEqual([]);
  });

  it('formats the labels back to a comma-separated list', () => {
    expect(formatSentiments(parseSentiments('Cautious bullish ,informative'))).toBe('cautiously bullish, informative');
  });
});
