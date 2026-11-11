export type ItemType = 'youtube_transcript' | 'webpage_text';

export const ITEM_TYPES: readonly ItemType[] = ['youtube_transcript', 'webpage_text'];

/** Optional extra metadata. Not required by the PRD schema; older or imported items can omit it. */
export interface ItemMeta {
  channel?: string;
  videoId?: string;
  language?: string;
  durationSec?: number;
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
  | { ok: true; item: SavedItem; created: boolean; stats: CaptureStats }
  | { ok: false; code: CaptureErrorCode; error: string };

export type RuntimeMessage = { type: 'capture-tab'; tabId: number };
