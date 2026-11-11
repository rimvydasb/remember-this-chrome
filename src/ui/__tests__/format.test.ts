import { describe, expect, it } from 'vitest';
import { readingTime } from '../format';

describe('readingTime', () => {
  it.each([
    [0, '1 min read'],
    [230, '1 min read'],
    [600, '3 min read'],
    [23_000, '100 min read'],
  ])('%i words take %s', (words, expected) => {
    expect(readingTime(words)).toBe(expected);
  });
});
