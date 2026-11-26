import { createTags } from '../shared/tags';
import type { SavedItem, Tag } from '../shared/types';

let counter = 0;

/** A saved item with unique defaults. */
export function makeItem(overrides: Partial<SavedItem> = {}): SavedItem {
  counter++;
  return {
    id: `id-${counter}`,
    title: `Item ${counter}`,
    url: `https://example.com/${counter}`,
    type: 'webpage_text',
    content: `Content of item ${counter}.`,
    timestamp: new Date(Date.UTC(2026, 0, counter)).toISOString(),
    ...overrides,
  };
}

/** Stored topic tags, as the AI tagging makes them. */
export const topicTags = (...labels: string[]): Tag[] =>
  createTags('ai-topics', labels, { createdAt: '2026-01-01T00:00:00.000Z' });

/** Stored sentiment tags, as the sentiment analysis makes them. */
export const sentimentTags = (...labels: string[]): Tag[] =>
  createTags('ai-sentiment', labels, { createdAt: '2026-01-01T00:00:00.000Z' });
