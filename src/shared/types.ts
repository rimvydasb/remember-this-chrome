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
  /** Small JPEG thumbnail of the video as a data URL, saved at capture time so the list needs no network. */
  thumbnail?: string;
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
export type FollowUpType = 'llm-summary' | 'user-question' | 'related-articles';

export const FOLLOW_UP_TYPES: readonly FollowUpType[] = ['llm-summary', 'user-question', 'related-articles'];

/** Phase II state of fetching a related article. Phase I leaves it unset. */
export type RelatedArticleFetchState = 'pending' | 'done' | 'failed';

export const RELATED_ARTICLE_FETCH_STATES: readonly RelatedArticleFetchState[] = ['pending', 'done', 'failed'];

/** A web page that a search for an item found. */
export interface RelatedArticle {
  /** Canonical result URL, without Google tracking parameters. */
  url: string;
  /** Text of the result heading. */
  title: string;
  /** Result description, when the page has one. */
  snippet?: string;
  /** The queries that returned this URL, best rank first. */
  queries: string[];
  /** Best 1-based rank over all queries. */
  bestRank: number;
  /** Reserved for Phase II (fetching the articles). */
  fetchState?: RelatedArticleFetchState;
}

/**
 * A result of follow-up work on a saved item: an LLM summary of the transcript, a question of the
 * user with the LLM answer, or the articles that a web search for the item found.
 */
export interface FollowUp {
  id: string;
  type: FollowUpType;
  /** What the user wrote, for example the question of a `user-question`. */
  userContent?: string;
  /** What the LLM generated. Empty while a question waits for its answer or after the answer failed. */
  generatedContent: string;
  /** ISO date string. */
  createdAt: string;
  /** The model that produced the content, when an LLM made it. */
  model?: string;
  /** The articles found, for type `related-articles`. `generatedContent` has the same links as Markdown. */
  articles?: RelatedArticle[];
  /** The search queries that were run, for type `related-articles`. */
  queries?: string[];
}

/** The filter facet that a stored tag belongs to. The channel facet comes from `meta.channel`. */
export type TagKind = 'topic' | 'sentiment';

export const TAG_KINDS: readonly TagKind[] = ['topic', 'sentiment'];

/**
 * Who manages a tag. A source replaces only its own tags: generating the sentiment again replaces
 * the `ai-sentiment` tags and keeps the `ai-topics` tags.
 */
export type TagSource = 'ai-topics' | 'ai-sentiment';

export const TAG_SOURCES: readonly TagSource[] = ['ai-topics', 'ai-sentiment'];

/**
 * A tag stored on an item. Sentiment labels are from the vocabulary in `shared/sentiment.ts`.
 * Items without topic tags get topics by keyword extraction (see `keywords.ts`); those are not stored.
 */
export interface Tag {
  /** Display text. */
  label: string;
  kind: TagKind;
  source: TagSource;
  /** The model that generated the tag, when an LLM made it. */
  model?: string;
  /** ISO date string. */
  createdAt: string;
}

/**
 * A mark that the user puts on an item. `loved` items are favorites. `forgotten` items are hidden
 * from the library view; only forgotten items can be deleted.
 */
export type ItemMark = 'loved' | 'forgotten';

export const ITEM_MARKS: readonly ItemMark[] = ['loved', 'forgotten'];

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
  /** The user's mark. Unmarked items omit it. */
  mark?: ItemMark;
  /** Stored tags, in order of relevance within each source. Untagged items omit it. */
  tags?: Tag[];
  /** ID of the catalog the item is in. Items without it are in the default catalog (Recents). */
  catalogId?: string;
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

/** Parts of an item that a capture can change. Used to tell the user what an update changed. */
export type CaptureField =
  'title' | 'content' | 'channel' | 'duration' | 'language' | 'views' | 'description' | 'links' | 'chapters';
