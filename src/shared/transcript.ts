import { decodeHtmlEntities } from './entities';

export interface RawSegment {
  startMs: number;
  /** 0 when unknown. */
  durationMs: number;
  text: string;
}

export interface ParagraphOptions {
  /** A paragraph may end at a sentence end once it has at least this many characters. */
  minChars: number;
  /** A paragraph always ends after this many characters (at a segment boundary). */
  maxChars: number;
  /** A pause in speech of at least this length ends a paragraph of at least `pauseMinChars`. */
  pauseMs: number;
  pauseMinChars: number;
}

export const DEFAULT_PARAGRAPH_OPTIONS: ParagraphOptions = {
  minChars: 320,
  maxChars: 1100,
  pauseMs: 2500,
  pauseMinChars: 140,
};

const ZERO_WIDTH = /[​-‍⁠﻿]/g;
const SENTENCE_END = /[.!?…。！？]["'”’)\]]*$/;
const SPEAKER_CHANGE = /^(>>|&gt;&gt;)\s*/;

/** Cleans a single caption fragment: decodes entities, removes line breaks and redundant whitespace. */
export function cleanSegmentText(text: string): string {
  return decodeHtmlEntities(text)
    .replace(ZERO_WIDTH, '')
    .replace(/[\r\n\t ]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function tidyParagraph(text: string): string {
  return text
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.!?;:…])/g, '$1')
    .trim();
}

/**
 * Concatenates caption fragments into readable paragraphs. Timestamps are dropped; pauses,
 * sentence ends, and speaker changes (`>>`) decide where paragraphs break.
 */
export function segmentsToParagraphs(
  segments: readonly RawSegment[],
  options: ParagraphOptions = DEFAULT_PARAGRAPH_OPTIONS,
): string[] {
  const paragraphs: string[] = [];
  let current = '';
  let previousText = '';
  let previousEndMs: number | null = null;

  const flush = () => {
    const tidy = tidyParagraph(current);
    if (tidy) paragraphs.push(tidy);
    current = '';
  };

  for (const segment of segments) {
    let text = cleanSegmentText(segment.text);
    if (!text) continue;

    const speakerChange = SPEAKER_CHANGE.test(text);
    if (speakerChange) {
      text = text.replace(SPEAKER_CHANGE, '').trim();
      if (current) flush();
      if (!text) continue;
    }

    // Rolling auto-captions sometimes repeat the previous fragment verbatim.
    if (text === previousText) continue;

    const gapMs = previousEndMs === null ? 0 : segment.startMs - previousEndMs;
    const length = current.length;
    if (length > 0) {
      const endsSentence = SENTENCE_END.test(current);
      if (
        (endsSentence && length >= options.minChars) ||
        (gapMs >= options.pauseMs && length >= options.pauseMinChars) ||
        length >= options.maxChars
      ) {
        flush();
      }
    }

    current = current ? `${current} ${text}` : text;
    previousText = text;
    previousEndMs = segment.startMs + Math.max(0, segment.durationMs);
  }
  flush();
  return paragraphs;
}

export function formatTranscript(segments: readonly RawSegment[]): string {
  return segmentsToParagraphs(segments).join('\n\n');
}

export function countWords(text: string): number {
  const matches = text.match(/\S+/g);
  return matches ? matches.length : 0;
}
