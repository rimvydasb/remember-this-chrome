import type { SavedItem } from '../shared/types';

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
