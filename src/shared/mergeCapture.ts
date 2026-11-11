import type { ItemMeta, SavedItem } from './types';

/** A new capture, before it gets an ID and a timestamp. */
export type Capture = Omit<SavedItem, 'id' | 'timestamp'>;

/** Parts of an item that a capture can change. Used to tell the user what an update changed. */
export type CaptureField =
  'title' | 'content' | 'channel' | 'duration' | 'language' | 'views' | 'description' | 'links' | 'chapters';

export interface MergeResult {
  item: SavedItem;
  /** Fields whose value differs from the existing item. Empty for a new item. */
  changed: CaptureField[];
}

const hasText = (value: string | undefined): value is string => typeof value === 'string' && value.trim() !== '';
const hasList = <T>(value: readonly T[] | undefined): value is T[] => Array.isArray(value) && value.length > 0;
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Merges a new capture into the item that the library already has for the same source.
 *
 * A re-capture can fail to read some parts that the first capture had (for example the page data
 * with the chapters did not load). So a value replaces the stored one only when the new capture
 * actually has it; a missing or empty value keeps the stored one:
 * - title, content, channel, duration, language, view count, chapters: replaced when present.
 * - description: replaced when present, because authors edit descriptions. The links come from the
 *   description, so they are replaced together with it (also when the new description has no links).
 * - `viewCountAt` records when the stored view count was read.
 * - Metadata that this version does not know about is kept.
 *
 * Without an existing item, the capture becomes a new item with `fallbackTitle` when it has no title.
 */
export function mergeCapture(
  existing: SavedItem | undefined,
  capture: Capture,
  options: { id: string; now: Date; fallbackTitle?: string },
): MergeResult {
  const timestamp = options.now.toISOString();
  const incoming: ItemMeta = capture.meta ?? {};

  if (!existing) {
    const meta: ItemMeta = { ...incoming };
    if (meta.viewCount !== undefined) meta.viewCountAt = timestamp;
    const item: SavedItem = {
      ...capture,
      title: hasText(capture.title) ? capture.title : (options.fallbackTitle ?? ''),
      id: options.id,
      timestamp,
    };
    if (Object.keys(meta).length > 0) item.meta = meta;
    else delete item.meta;
    return { item, changed: [] };
  }

  const old: ItemMeta = existing.meta ?? {};
  const meta: ItemMeta = { ...old };
  if (hasText(incoming.videoId)) meta.videoId = incoming.videoId;
  if (hasText(incoming.channel)) meta.channel = incoming.channel;
  if (hasText(incoming.language)) meta.language = incoming.language;
  if (incoming.durationSec) meta.durationSec = incoming.durationSec;
  if (incoming.viewCount !== undefined) {
    meta.viewCount = incoming.viewCount;
    meta.viewCountAt = timestamp;
  }
  if (hasList(incoming.chapters)) meta.chapters = incoming.chapters;
  if (hasText(incoming.description)) {
    meta.description = incoming.description;
    if (hasList(incoming.links)) meta.links = incoming.links;
    else delete meta.links;
  }

  const item: SavedItem = {
    ...existing,
    title: hasText(capture.title) ? capture.title : existing.title,
    content: hasText(capture.content) ? capture.content : existing.content,
    timestamp,
  };
  if (Object.keys(meta).length > 0) item.meta = meta;

  const changed: CaptureField[] = [];
  const check = (field: CaptureField, a: unknown, b: unknown) => {
    if (!same(a, b)) changed.push(field);
  };
  check('title', existing.title, item.title);
  check('content', existing.content, item.content);
  check('channel', old.channel, meta.channel);
  check('duration', old.durationSec, meta.durationSec);
  check('language', old.language, meta.language);
  check('views', old.viewCount, meta.viewCount);
  check('description', old.description, meta.description);
  check('links', old.links, meta.links);
  check('chapters', old.chapters, meta.chapters);
  return { item, changed };
}
