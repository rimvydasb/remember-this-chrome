import type { CaptureField } from './mergeCapture';

export type ItemType = 'youtube_transcript' | 'webpage_text';

export const ITEM_TYPES: readonly ItemType[] = ['youtube_transcript', 'webpage_text'];

/** A chapter of a video. */
export interface VideoChapter {
  /** Start of the chapter, in seconds from the start of the video. */
  startSec: number;
  title: string;
}

/** A URL mentioned in the source (for example in a video description). */
export interface VideoLink {
  url: string;
  /** Text next to the URL that tells what it is, when there is any. */
  label?: string;
}

/** Optional extra metadata. Not required by the PRD schema; older or imported items can omit it. */
export interface ItemMeta {
  channel?: string;
  videoId?: string;
  language?: string;
  durationSec?: number;
  /** The video description, as the author wrote it. */
  description?: string;
  /** View count when it was last read. */
  viewCount?: number;
  /** ISO date when `viewCount` was read. Older items lack it; then `SavedItem.timestamp` applies. */
  viewCountAt?: string;
  chapters?: VideoChapter[];
  /** URLs mentioned in the description, in order of first appearance. */
  links?: VideoLink[];
}

/** Kinds of follow-up work done on a saved item. */
export type FollowUpType = 'llm-summary';

export const FOLLOW_UP_TYPES: readonly FollowUpType[] = ['llm-summary'];

/** A result of follow-up work on a saved item (for example an LLM summary of the transcript). */
export interface FollowUp {
  id: string;
  type: FollowUpType;
  content: string;
  /** ISO date string. */
  createdAt: string;
  /** The model that produced the content, when an LLM made it. */
  model?: string;
}

/** A captured record, as defined in the PRD data schema (section 3). */
export interface SavedItem {
  id: string;
  title: string;
  url: string;
  type: ItemType;
  content: string;
  /** ISO date string. */
  timestamp: string;
  meta?: ItemMeta;
  /** Follow-ups attached to the item, oldest first. Older or imported items can omit it. */
  followUps?: FollowUp[];
}

export interface CaptureStats {
  extractMs: number;
  words: number;
  paragraphs: number;
  source: string;
}

export type CaptureErrorCode =
  'not_implemented' | 'not_watch_page' | 'no_captions' | 'extraction_failed' | 'injection_failed' | 'empty_transcript';

export type CaptureResponse =
  | {
      ok: true;
      item: SavedItem;
      created: boolean;
      /** For an update: what changed compared to the stored item. */
      changed: CaptureField[];
      stats: CaptureStats;
    }
  | { ok: false; code: CaptureErrorCode; error: string };

export type RuntimeMessage = { type: 'capture-tab'; tabId: number };
