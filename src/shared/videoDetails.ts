import type { ItemMeta, VideoChapter, VideoLink } from './types';

/** What the page extractor reports about a video (a subset of `ExtractionSuccess`). */
export interface VideoFacts {
  videoId: string;
  channel?: string;
  language?: string;
  durationSec?: number;
  description?: string;
  viewCount?: string | number;
  chapters?: readonly { startSec: number; title: string }[];
}

/**
 * Builds item metadata from extracted video facts. Chapters come from the page data when it has
 * them, else from timestamp lines in the description. Empty values are left out.
 */
export function buildVideoMeta(facts: VideoFacts): ItemMeta {
  const meta: ItemMeta = { videoId: facts.videoId };
  if (facts.channel) meta.channel = facts.channel;
  if (facts.language) meta.language = facts.language;
  if (facts.durationSec) meta.durationSec = facts.durationSec;

  const description = facts.description?.replace(/\r\n/g, '\n').trim();
  if (description) meta.description = description;

  const viewCount = parseViewCount(facts.viewCount);
  if (viewCount !== undefined) meta.viewCount = viewCount;

  const fromPage = normalizeChapters(facts.chapters);
  const chapters = fromPage.length > 0 ? fromPage : parseChapters(description);
  if (chapters.length > 0) meta.chapters = chapters;

  const links = extractLinks(description);
  if (links.length > 0) meta.links = links;
  return meta;
}

/** Parses `m:ss`, `mm:ss`, or `h:mm:ss` into seconds. Returns null for anything else. */
export function parseTimestamp(text: string): number | null {
  const match = /^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})$/.exec(text.trim());
  if (!match) return null;
  const [, h, m, s] = match;
  const minutes = Number(m);
  const seconds = Number(s);
  if (seconds > 59 || (h !== undefined && minutes > 59)) return null;
  return Number(h ?? 0) * 3600 + minutes * 60 + seconds;
}

const TIMESTAMP = String.raw`\d{1,2}(?::\d{2}){1,2}`;
const SEPARATOR = String.raw`[\s\-–—:|.)\]]*`;
/** `0:00 Title`, `(0:00) Title`, `- 0:00 - Title`, ... */
const LEADING_TIMESTAMP = new RegExp(String.raw`^\s*(?:[-•*·]\s*)?[(\[]?(${TIMESTAMP})${SEPARATOR}(.+?)\s*$`);
/** `Title - 0:00` */
const TRAILING_TIMESTAMP = new RegExp(String.raw`^\s*(?:[-•*·]\s*)?(.+?)[\s\-–—:|(\[]+(${TIMESTAMP})[)\]]?\s*$`);

/**
 * Reads the chapter list from a video description: lines that start (or end) with a timestamp.
 * Needs at least two such lines, as YouTube does, so a single "at 3:15 she says ..." is ignored.
 * The result is sorted by start time, with duplicate start times removed.
 */
export function parseChapters(description: string | undefined): VideoChapter[] {
  if (!description) return [];
  const byStart = new Map<number, VideoChapter>();
  for (const line of description.split(/\r?\n/)) {
    let stamp: string | undefined;
    let title: string | undefined;
    const leading = LEADING_TIMESTAMP.exec(line);
    if (leading) [, stamp, title] = leading;
    else {
      const trailing = TRAILING_TIMESTAMP.exec(line);
      if (trailing) [, title, stamp] = trailing;
    }
    const startSec = stamp ? parseTimestamp(stamp) : null;
    title = title?.trim();
    if (startSec === null || !title || byStart.has(startSec)) continue;
    byStart.set(startSec, { startSec, title });
  }
  if (byStart.size < 2) return [];
  return [...byStart.values()].sort((a, b) => a.startSec - b.startSec);
}

/** Cleans chapters from the page data: drops empty titles and duplicates, sorts by start. */
export function normalizeChapters(
  chapters: readonly { startSec: number; title: string }[] | undefined,
): VideoChapter[] {
  if (!chapters) return [];
  const byStart = new Map<number, VideoChapter>();
  for (const chapter of chapters) {
    const startSec = Math.max(0, Math.floor(Number(chapter.startSec)));
    const title = String(chapter.title ?? '').trim();
    if (!Number.isFinite(startSec) || !title || byStart.has(startSec)) continue;
    byStart.set(startSec, { startSec, title });
  }
  return [...byStart.values()].sort((a, b) => a.startSec - b.startSec);
}

const URL_PATTERN = /\bhttps?:\/\/[^\s<>"'`]+/gi;
const TRAILING_PUNCTUATION = /[.,;:!?'"’”]+$/;

/** Removes punctuation that ends a sentence, and a closing bracket without an opening one. */
function trimUrl(raw: string): string {
  let url = raw.replace(TRAILING_PUNCTUATION, '');
  for (const [open, close] of [
    ['(', ')'],
    ['[', ']'],
  ] as const) {
    while (url.endsWith(close) && url.split(open).length < url.split(close).length) {
      url = url.slice(0, -1).replace(TRAILING_PUNCTUATION, '');
    }
  }
  return url;
}

function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.hostname.includes('.');
  } catch {
    return false;
  }
}

function cleanLabel(text: string): string {
  return text
    .replace(/^[\s\-–—•*·|:>]+|[\s\-–—•*·|:>]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Finds every http(s) URL in a text, in order of first appearance, without duplicates.
 * The label is the text on the same line before the URL (`Docs: https://...` gives `Docs`).
 * When the URL is alone on its line, the label is the nearest earlier line that ends with a
 * colon (`Learn more:`), if no other text came between them.
 */
export function extractLinks(text: string | undefined): VideoLink[] {
  if (!text) return [];
  const links: VideoLink[] = [];
  const seen = new Set<string>();
  let heading: string | undefined;

  for (const line of text.split(/\r?\n/)) {
    const matches = [...line.matchAll(URL_PATTERN)];
    if (matches.length === 0) {
      const trimmed = line.trim();
      if (trimmed) heading = trimmed.endsWith(':') ? cleanLabel(trimmed) || undefined : undefined;
      continue;
    }
    let cursor = 0;
    for (const match of matches) {
      const url = trimUrl(match[0]);
      const before = cleanLabel(line.slice(cursor, match.index));
      cursor = match.index + match[0].length;
      if (!isValidUrl(url) || seen.has(url)) continue;
      seen.add(url);
      const label = before || heading;
      links.push(label ? { url, label } : { url });
    }
  }
  return links;
}

export type TextPart = { text: string; url?: undefined } | { text: string; url: string };

/** Splits text into plain parts and URL parts, so a UI can render the URLs as links. */
export function splitLinks(text: string): TextPart[] {
  const parts: TextPart[] = [];
  const push = (part: TextPart) => {
    const last = parts[parts.length - 1];
    if (!part.url && last && !last.url) last.text += part.text;
    else if (part.text) parts.push(part);
  };
  let cursor = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    const url = trimUrl(match[0]);
    push({ text: text.slice(cursor, match.index) });
    push(isValidUrl(url) ? { text: url, url } : { text: url });
    cursor = match.index + url.length;
  }
  push({ text: text.slice(cursor) });
  return parts;
}

/** A watch URL that starts playback at `startSec`. */
export function chapterUrl(videoId: string, startSec: number): string {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&t=${Math.max(0, Math.floor(startSec))}s`;
}

/** Parses a view count such as `407883`, `"407,883 views"`, or `"1.234.567"`. Returns undefined when unknown. */
export function parseViewCount(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? Math.floor(value) : undefined;
  if (typeof value !== 'string') return undefined;
  // Abbreviated counts ("1.2M views") are not exact; do not guess.
  if (/\d\s*[KMB]\b/i.test(value)) return undefined;
  const digits = value.match(/^\D*([\d.,\s  ]+)/)?.[1]?.replace(/\D/g, '');
  return digits ? Number(digits) : undefined;
}
