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

describe('markdown export of video details', () => {
  const video: SavedItem = {
    ...item,
    url: 'https://www.youtube.com/watch?v=mQZB0l-rhxE',
    meta: {
      videoId: 'mQZB0l-rhxE',
      viewCount: 407883,
      description: 'Intro line.\n\nLearn more:\nhttps://code.claude.com/docs/en/skills',
      chapters: [
        { startSec: 0, title: 'Hand off your manual checks' },
        { startSec: 61, title: 'Codify your *checks*' },
      ],
      links: [{ url: 'https://code.claude.com/docs/en/skills', label: 'Learn more' }, { url: 'https://a.example' }],
    },
  };

  it('renders views, chapters with jump links, links, and the description before the transcript', () => {
    const md = itemToMarkdown(video);
    expect(md).toContain('- **Views:** 407,883 (as of 2026-11-11T10:00:00.000Z)');
    expect(md).toContain(
      [
        '## Chapters',
        '',
        '- [0:00](https://www.youtube.com/watch?v=mQZB0l-rhxE&t=0s) Hand off your manual checks',
        '- [1:01](https://www.youtube.com/watch?v=mQZB0l-rhxE&t=61s) Codify your \\*checks\\*',
        '',
        '## Links',
        '',
        '- Learn more: <https://code.claude.com/docs/en/skills>',
        '- <https://a.example>',
        '',
        '## Description',
        '',
        '> Intro line.',
        '>',
        '> Learn more:',
        '> https://code.claude.com/docs/en/skills',
        '',
        '## Transcript',
        '',
        'First paragraph.',
      ].join('\n'),
    );
  });

  it('nests the sections one level below the item heading', () => {
    const md = itemsToMarkdown([video, item]);
    expect(md).toContain('\n### Chapters\n');
    expect(md).toContain('\n### Transcript\n');
  });

  it('takes the video ID from the URL when the metadata has none', () => {
    const md = itemToMarkdown({ ...video, meta: { chapters: [{ startSec: 5, title: 'A' }] } });
    expect(md).toContain('- [0:05](https://www.youtube.com/watch?v=mQZB0l-rhxE&t=5s) A');
  });

  it('adds no extra sections for items without video details', () => {
    expect(itemToMarkdown(item)).not.toContain('Transcript');
  });
});
