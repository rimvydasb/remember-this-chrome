import { describe, expect, it } from 'vitest';
import { decodeHtmlEntities } from '../entities';
import { cleanSegmentText, countWords, formatTranscript, segmentsToParagraphs, type RawSegment } from '../transcript';

const seg = (startMs: number, text: string, durationMs = 1000): RawSegment => ({ startMs, durationMs, text });

describe('decodeHtmlEntities', () => {
  it('decodes numeric, hex and named entities', () => {
    expect(decodeHtmlEntities('it&#39;s &quot;fine&quot; &amp; &#x2014; &hellip;')).toBe('it\'s "fine" & — …');
  });
  it('decodes double-encoded caption text', () => {
    expect(decodeHtmlEntities('don&amp;#39;t')).toBe("don't");
  });
  it('leaves unknown entities and plain ampersands alone', () => {
    expect(decodeHtmlEntities('R&D &bogus; a & b')).toBe('R&D &bogus; a & b');
  });
});

describe('cleanSegmentText', () => {
  it('removes line breaks, carriage returns and extra spaces', () => {
    expect(cleanSegmentText('  which means I had to write\r\na lot   of papers.\n')).toBe(
      'which means I had to write a lot of papers.',
    );
  });
});

describe('segmentsToParagraphs', () => {
  it('joins fragments into one paragraph', () => {
    expect(segmentsToParagraphs([seg(0, 'So in college,'), seg(1000, 'I was a government major.')])).toEqual([
      'So in college, I was a government major.',
    ]);
  });

  it('breaks at a sentence end once the paragraph is long enough', () => {
    const long = 'word '.repeat(70).trim() + '.';
    const paragraphs = segmentsToParagraphs([seg(0, long), seg(1000, 'Next idea starts here.')]);
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[1]).toBe('Next idea starts here.');
  });

  it('breaks on a long pause', () => {
    const text = 'a '.repeat(80).trim();
    const paragraphs = segmentsToParagraphs([seg(0, text, 1000), seg(10_000, 'after the pause')]);
    expect(paragraphs).toHaveLength(2);
  });

  it('breaks on speaker changes and removes the >> marker', () => {
    expect(
      segmentsToParagraphs([seg(0, 'Hello there.'), seg(1000, '&gt;&gt; Hi!'), seg(2000, 'How are you?')]),
    ).toEqual(['Hello there.', 'Hi! How are you?']);
  });

  it('drops empty and repeated fragments, and fixes spaces before punctuation', () => {
    expect(
      segmentsToParagraphs([seg(0, 'one'), seg(500, '\n'), seg(1000, 'one'), seg(1500, 'two'), seg(2000, ', three .')]),
    ).toEqual(['one two, three.']);
  });

  it('never exceeds the maximum paragraph length by more than one fragment', () => {
    const segments = Array.from({ length: 400 }, (_, i) => seg(i * 1000, 'lorem ipsum dolor sit amet'));
    for (const paragraph of segmentsToParagraphs(segments)) expect(paragraph.length).toBeLessThan(1200);
  });
});

describe('formatTranscript', () => {
  it('separates paragraphs with a blank line', () => {
    const text = 'x '.repeat(80).trim();
    expect(formatTranscript([seg(0, text), seg(10_000, 'y')])).toBe(`${text}\n\ny`);
  });
  it('counts words', () => {
    expect(countWords(' a b\n\nc ')).toBe(3);
  });
});
