import { describe, expect, it } from 'vitest';
import { questionPipeline, summaryPipeline, taggingPipeline } from '../services';

describe('follow-up services', () => {
  it('wires one pipeline per follow-up, each with its own id', () => {
    const ids = [summaryPipeline, questionPipeline, taggingPipeline].map((pipeline) => pipeline.id);
    expect(ids).toEqual(['summary', 'question', 'tagging']);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
