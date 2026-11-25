import { describe, expect, it } from 'vitest';
import { createFollowUp, followUpsOfType } from '../followUpRecords';
import type { SavedItem } from '../types';

const base = {
  id: 'i',
  url: 'u',
  title: 't',
  content: 'c',
  timestamp: '2026-01-01T00:00:00Z',
  type: 'webpage_text',
} as SavedItem;

describe('followUps', () => {
  it('creates follow-ups with unique ids and empty generated content', () => {
    const a = createFollowUp('user-question', { userContent: 'Why?' });
    const b = createFollowUp('llm-summary');
    expect(a.id).not.toBe(b.id);
    expect(a).toMatchObject({ type: 'user-question', userContent: 'Why?', generatedContent: '' });
    expect(Number.isNaN(Date.parse(a.createdAt))).toBe(false);
  });

  it('filters follow-ups by type and tolerates items without any', () => {
    const q = createFollowUp('user-question');
    const s = createFollowUp('llm-summary');
    expect(followUpsOfType({ ...base, followUps: [q, s] }, 'user-question')).toEqual([q]);
    expect(followUpsOfType(base, 'llm-summary')).toEqual([]);
  });
});
