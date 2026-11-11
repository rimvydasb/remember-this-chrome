import { describe, expect, it } from 'vitest';
import { formatDuration, itemsToMarkdown, itemToMarkdown, markdownFileName, slugify } from '../markdown';
import type { SavedItem } from '../types';

const item: SavedItem = {
  id: '1',
  title: 'Inside the *Mind* of a Procrastinator | TED',
  url: 'https://www.youtube.com/watch?v=arj7oStGLkU',
  type: 'youtube_transcript',
  content: 'First paragraph.\n\nSecond paragraph.',
  timestamp: '2026-11-11T10:00:00.000Z',
  meta: { channel: 'TED', durationSec: 844 },
};

describe('markdown export', () => {
  it('renders one item with metadata and content', () => {
    const md = itemToMarkdown(item);
    expect(md).toContain('# Inside the \\*Mind\\* of a Procrastinator \\| TED');
    expect(md).toContain('- **Channel:** TED');
    expect(md).toContain('- **Duration:** 14:04');
    expect(md).toContain('- **Words:** 4');
    expect(md).toContain('First paragraph.\n\nSecond paragraph.');
  });

  it('combines several items under level-2 headings', () => {
    const md = itemsToMarkdown([item, { ...item, id: '2', title: 'Second' }], new Date('2026-11-11T00:00:00Z'));
    expect(md.startsWith('# Remember This — export')).toBe(true);
    expect(md).toContain('\n## Second');
    expect(md.split('\n---\n')).toHaveLength(3);
  });

  it('builds file names', () => {
    expect(slugify('Ünïcode — Title! 2026')).toBe('unicode-title-2026');
    expect(slugify('???')).toBe('transcript');
    expect(markdownFileName([item])).toBe('inside-the-mind-of-a-procrastinator-ted.md');
    expect(markdownFileName([item, item], new Date('2026-11-11T00:00:00Z'))).toBe(
      'remember-this-2026-11-11-2-items.md',
    );
  });

  it('formats durations', () => {
    expect(formatDuration(59)).toBe('0:59');
    expect(formatDuration(3725)).toBe('1:02:05');
  });
});
