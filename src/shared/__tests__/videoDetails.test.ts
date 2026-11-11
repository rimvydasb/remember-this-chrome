import { describe, expect, it } from 'vitest';
import {
  buildVideoMeta,
  chapterUrl,
  extractLinks,
  normalizeChapters,
  parseChapters,
  parseTimestamp,
  parseViewCount,
  splitLinks,
} from '../videoDetails';

/** The description of https://www.youtube.com/watch?v=mQZB0l-rhxE (URLs in full, as the player response has them). */
const DESCRIPTION = `Claude Code already runs your tests, type checks, and linters. This video shows how to give it more ways to verify its own work, so it gets further on its own and needs fewer rounds of back and forth.

Learn more:
https://code.claude.com/docs/en/skills

https://code.claude.com/docs/en/best-practices

Chapters
0:00 Hand off your manual checks
1:01 Codify your checks
1:49 The verification loop`;

describe('parseTimestamp', () => {
  it.each([
    ['0:00', 0],
    ['1:01', 61],
    ['12:34', 754],
    ['1:02:03', 3723],
    [' 01:00:00 ', 3600],
  ])('parses %s', (text, seconds) => {
    expect(parseTimestamp(text)).toBe(seconds);
  });

  it.each(['', '1', '1:2', '1:60', '1:60:00', 'a:bc', '123:00'])('rejects %j', (text) => {
    expect(parseTimestamp(text)).toBeNull();
  });
});

describe('parseChapters', () => {
  it('reads the chapter list of a description', () => {
    expect(parseChapters(DESCRIPTION)).toEqual([
      { startSec: 0, title: 'Hand off your manual checks' },
      { startSec: 61, title: 'Codify your checks' },
      { startSec: 109, title: 'The verification loop' },
    ]);
  });

  it('accepts common separators, brackets, bullets, and trailing timestamps', () => {
    const text = ['(00:00) Intro', '- 2:30 - Setup', '• [1:05:00] | Wrap-up', 'Bonus round 1:10:00'].join('\n');
    expect(parseChapters(text)).toEqual([
      { startSec: 0, title: 'Intro' },
      { startSec: 150, title: 'Setup' },
      { startSec: 3900, title: 'Wrap-up' },
      { startSec: 4200, title: 'Bonus round' },
    ]);
  });

  it('sorts by start time and drops duplicate start times', () => {
    expect(parseChapters('5:00 Later\n0:00 Start\n5:00 Again')).toEqual([
      { startSec: 0, title: 'Start' },
      { startSec: 300, title: 'Later' },
    ]);
  });

  it('needs at least two timestamp lines', () => {
    expect(parseChapters('Watch from 3:15 for the demo')).toEqual([]);
    expect(parseChapters('3:15 The demo')).toEqual([]);
  });

  it('ignores lines without a title and empty input', () => {
    expect(parseChapters('0:00\n1:00')).toEqual([]);
    expect(parseChapters(undefined)).toEqual([]);
    expect(parseChapters('')).toEqual([]);
  });
});

describe('normalizeChapters', () => {
  it('trims titles, drops empty and duplicate entries, and sorts', () => {
    expect(
      normalizeChapters([
        { startSec: 61.9, title: ' B ' },
        { startSec: 0, title: 'A' },
        { startSec: 61, title: 'dup' },
        { startSec: 120, title: '  ' },
      ]),
    ).toEqual([
      { startSec: 0, title: 'A' },
      { startSec: 61, title: 'B' },
    ]);
    expect(normalizeChapters(undefined)).toEqual([]);
  });
});

describe('extractLinks', () => {
  it('labels links alone on their line with the heading line above them', () => {
    expect(extractLinks(DESCRIPTION)).toEqual([
      { url: 'https://code.claude.com/docs/en/skills', label: 'Learn more' },
      { url: 'https://code.claude.com/docs/en/best-practices', label: 'Learn more' },
    ]);
  });

  it('uses text on the same line as the label', () => {
    expect(extractLinks('Docs: https://a.example/docs\n► Twitter - https://x.example/me')).toEqual([
      { url: 'https://a.example/docs', label: 'Docs' },
      { url: 'https://x.example/me', label: '► Twitter' },
    ]);
  });

  it('does not reuse a heading after other text', () => {
    expect(extractLinks('Links:\nSome sentence.\nhttps://a.example')).toEqual([{ url: 'https://a.example' }]);
  });

  it('strips trailing punctuation and unbalanced brackets', () => {
    expect(
      extractLinks(
        'See https://a.example/x. Also (https://b.example/y) and https://en.wikipedia.org/wiki/Foo_(bar)!',
      ).map((link) => link.url),
    ).toEqual(['https://a.example/x', 'https://b.example/y', 'https://en.wikipedia.org/wiki/Foo_(bar)']);
  });

  it('removes duplicates and keeps first-appearance order', () => {
    const urls = extractLinks('https://b.example\nhttps://a.example\nhttps://b.example').map((link) => link.url);
    expect(urls).toEqual(['https://b.example', 'https://a.example']);
  });

  it('ignores non-http schemes and hosts without a dot', () => {
    expect(extractLinks('javascript:alert(1) ftp://a.example http://localhost')).toEqual([]);
    expect(extractLinks(undefined)).toEqual([]);
  });
});

describe('splitLinks', () => {
  it('splits text into plain and URL parts', () => {
    expect(splitLinks('Read https://a.example/x. Then stop.')).toEqual([
      { text: 'Read ' },
      { text: 'https://a.example/x', url: 'https://a.example/x' },
      { text: '. Then stop.' },
    ]);
  });

  it('returns one part for text without URLs', () => {
    expect(splitLinks('plain')).toEqual([{ text: 'plain' }]);
    expect(splitLinks('')).toEqual([]);
  });
});

describe('chapterUrl', () => {
  it('links to the start of a chapter', () => {
    expect(chapterUrl('mQZB0l-rhxE', 61)).toBe('https://www.youtube.com/watch?v=mQZB0l-rhxE&t=61s');
    expect(chapterUrl('abc', 12.7)).toBe('https://www.youtube.com/watch?v=abc&t=12s');
  });
});

describe('parseViewCount', () => {
  it.each([
    ['407883', 407883],
    ['407,883 views', 407883],
    ['1.234.567 Aufrufe', 1234567],
    ['1 234 567 vues', 1234567],
    [42, 42],
    [0, 0],
  ])('parses %j', (value, expected) => {
    expect(parseViewCount(value)).toBe(expected);
  });

  it.each([undefined, null, '', 'No views', '1.2M views', '15K views', -1, Number.NaN])('rejects %j', (value) => {
    expect(parseViewCount(value)).toBeUndefined();
  });
});

describe('buildVideoMeta', () => {
  it('builds metadata for the example video', () => {
    expect(
      buildVideoMeta({
        videoId: 'mQZB0l-rhxE',
        channel: 'Anthropic',
        language: 'English',
        durationSec: 150,
        description: DESCRIPTION,
        viewCount: '407883',
      }),
    ).toEqual({
      videoId: 'mQZB0l-rhxE',
      channel: 'Anthropic',
      language: 'English',
      durationSec: 150,
      description: DESCRIPTION,
      viewCount: 407883,
      chapters: [
        { startSec: 0, title: 'Hand off your manual checks' },
        { startSec: 61, title: 'Codify your checks' },
        { startSec: 109, title: 'The verification loop' },
      ],
      links: [
        { url: 'https://code.claude.com/docs/en/skills', label: 'Learn more' },
        { url: 'https://code.claude.com/docs/en/best-practices', label: 'Learn more' },
      ],
    });
  });

  it('prefers chapters from the page data over the description', () => {
    const meta = buildVideoMeta({
      videoId: 'x',
      description: DESCRIPTION,
      chapters: [{ startSec: 0, title: 'Auto chapter' }],
    });
    expect(meta.chapters).toEqual([{ startSec: 0, title: 'Auto chapter' }]);
  });

  it('leaves out empty values', () => {
    expect(buildVideoMeta({ videoId: 'x', description: '  \r\n ', viewCount: '', chapters: [] })).toEqual({
      videoId: 'x',
    });
  });
});
