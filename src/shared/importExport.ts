import { parseCatalog, RECENTS_ID, type Catalog } from './catalogs';
import {
  FOLLOW_UP_TYPES,
  ITEM_MARKS,
  ITEM_TYPES,
  RELATED_ARTICLE_FETCH_STATES,
  type AiTags,
  type FollowUp,
  type FollowUpType,
  type ItemMark,
  type ItemMeta,
  type ItemType,
  type RelatedArticle,
  type RelatedArticleFetchState,
  type SavedItem,
} from './types';

export const EXPORT_FORMAT = 'remember-this-library';
export const EXPORT_VERSION = 1;

export interface ExportPayload {
  format: typeof EXPORT_FORMAT;
  version: number;
  exportedAt: string;
  count: number;
  /** The user's catalogs (Recents is implied). Older exports omit it. */
  catalogs?: Catalog[];
  items: SavedItem[];
}

export function buildExportPayload(
  items: readonly SavedItem[],
  now = new Date(),
  catalogs: readonly Catalog[] = [],
): ExportPayload {
  const userCatalogs = catalogs.filter((catalog) => catalog.id !== RECENTS_ID);
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: now.toISOString(),
    count: items.length,
    ...(userCatalogs.length > 0 ? { catalogs: userCatalogs } : {}),
    items: [...items],
  };
}

export class ImportError extends Error {}

export interface ParsedImport {
  items: SavedItem[];
  /** Catalogs in the file. Empty for older exports and bare arrays. */
  catalogs: Catalog[];
  /** Records that failed validation and were skipped. */
  rejected: { index: number; reason: string }[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseMeta(value: unknown): ItemMeta | undefined {
  if (!isRecord(value)) return undefined;
  const meta: ItemMeta = {};
  if (typeof value.channel === 'string') meta.channel = value.channel;
  if (typeof value.videoId === 'string') meta.videoId = value.videoId;
  if (typeof value.thumbnail === 'string' && value.thumbnail.startsWith('data:image/')) {
    meta.thumbnail = value.thumbnail;
  }
  if (typeof value.language === 'string') meta.language = value.language;
  if (typeof value.durationSec === 'number' && Number.isFinite(value.durationSec)) {
    meta.durationSec = value.durationSec;
  }
  if (typeof value.description === 'string') meta.description = value.description;
  if (typeof value.viewCount === 'number' && Number.isInteger(value.viewCount) && value.viewCount >= 0) {
    meta.viewCount = value.viewCount;
    if (typeof value.viewCountAt === 'string' && !Number.isNaN(Date.parse(value.viewCountAt))) {
      meta.viewCountAt = new Date(value.viewCountAt).toISOString();
    }
  }
  const chapters = parseList(value.chapters, (entry) =>
    typeof entry.startSec === 'number' &&
    Number.isFinite(entry.startSec) &&
    entry.startSec >= 0 &&
    typeof entry.title === 'string'
      ? { startSec: entry.startSec, title: entry.title }
      : undefined,
  );
  if (chapters) meta.chapters = chapters;
  const links = parseList(value.links, (entry) => {
    if (typeof entry.url !== 'string' || !isHttpUrl(entry.url)) return undefined;
    return typeof entry.label === 'string' ? { url: entry.url, label: entry.label } : { url: entry.url };
  });
  if (links) meta.links = links;
  return Object.keys(meta).length > 0 ? meta : undefined;
}

/** Keeps the valid entries of an array of records. Returns undefined when none are valid. */
function parseList<T>(value: unknown, parse: (entry: Record<string, unknown>) => T | undefined): T[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const result = value.flatMap((entry) => {
    const parsed = isRecord(entry) ? parse(entry) : undefined;
    return parsed === undefined ? [] : [parsed];
  });
  return result.length > 0 ? result : undefined;
}

/** Only http(s) links are kept, so an imported file cannot add `javascript:` links to the dashboard. */
function isHttpUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

/** Validates one record. Returns the normalized item, or a reason string when it is invalid. */
export function validateItem(value: unknown): SavedItem | string {
  if (!isRecord(value)) return 'not an object';
  const { id, title, url, type, content, timestamp } = value;
  if (typeof id !== 'string' || id.trim() === '') return 'missing "id"';
  if (typeof title !== 'string') return 'missing "title"';
  if (typeof url !== 'string') return 'missing "url"';
  if (typeof type !== 'string' || !ITEM_TYPES.includes(type as ItemType)) return `unknown "type"`;
  if (typeof content !== 'string') return 'missing "content"';
  if (typeof timestamp !== 'string' || Number.isNaN(Date.parse(timestamp))) return 'invalid "timestamp"';

  const item: SavedItem = {
    id,
    title,
    url,
    type: type as ItemType,
    content,
    timestamp: new Date(timestamp).toISOString(),
  };
  const meta = parseMeta(value.meta);
  if (meta) item.meta = meta;
  const followUps = parseList(value.followUps, parseFollowUp);
  if (followUps) item.followUps = followUps;
  if (typeof value.mark === 'string' && ITEM_MARKS.includes(value.mark as ItemMark)) item.mark = value.mark as ItemMark;
  const aiTags = parseAiTags(value.aiTags);
  if (aiTags) item.aiTags = aiTags;
  if (typeof value.catalogId === 'string' && value.catalogId !== '' && value.catalogId !== RECENTS_ID) {
    item.catalogId = value.catalogId;
  }
  return item;
}

function parseAiTags(value: unknown): AiTags | undefined {
  if (!isRecord(value) || !Array.isArray(value.tags)) return undefined;
  const tags = value.tags.filter((tag): tag is string => typeof tag === 'string' && tag.trim() !== '');
  if (tags.length === 0 || typeof value.createdAt !== 'string' || Number.isNaN(Date.parse(value.createdAt))) {
    return undefined;
  }
  const result: AiTags = { tags, createdAt: value.createdAt };
  if (typeof value.model === 'string' && value.model) result.model = value.model;
  return result;
}

function parseFollowUp(entry: Record<string, unknown>): FollowUp | undefined {
  const { id, type, userContent, createdAt, model } = entry;
  // Files exported before `generatedContent` existed have the text in `content`.
  const generatedContent = entry.generatedContent ?? entry.content;
  if (typeof id !== 'string' || id.trim() === '') return undefined;
  if (typeof type !== 'string' || !FOLLOW_UP_TYPES.includes(type as FollowUpType)) return undefined;
  if (typeof generatedContent !== 'string') return undefined;
  if (typeof createdAt !== 'string' || Number.isNaN(Date.parse(createdAt))) return undefined;
  if (type === 'user-question' && (typeof userContent !== 'string' || userContent.trim() === '')) return undefined;
  const followUp: FollowUp = {
    id,
    type: type as FollowUpType,
    generatedContent,
    createdAt: new Date(createdAt).toISOString(),
  };
  if (typeof userContent === 'string' && userContent !== '') followUp.userContent = userContent;
  if (typeof model === 'string' && model !== '') followUp.model = model;
  if (type === 'related-articles') {
    // Older files lack the lists; then `generatedContent` alone carries the links. A list that is
    // present must be valid as a whole, so a damaged file cannot add half of a search.
    if (entry.articles !== undefined) {
      const articles = parseAllOrNothing(entry.articles, parseRelatedArticle);
      if (!articles) return undefined;
      followUp.articles = articles;
    }
    if (entry.queries !== undefined) {
      const queries = parseStrings(entry.queries);
      if (!queries) return undefined;
      followUp.queries = queries;
    }
  }
  return followUp;
}

/** Every entry parsed, or undefined when the value is not an array or any entry is invalid. */
function parseAllOrNothing<T>(
  value: unknown,
  parse: (entry: Record<string, unknown>) => T | undefined,
): T[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const result: T[] = [];
  for (const entry of value) {
    const parsed = isRecord(entry) ? parse(entry) : undefined;
    if (parsed === undefined) return undefined;
    result.push(parsed);
  }
  return result;
}

/** An array of non-empty strings, or undefined. */
function parseStrings(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === 'string' && entry.trim() !== ''))
    return undefined;
  return value as string[];
}

function parseRelatedArticle(entry: Record<string, unknown>): RelatedArticle | undefined {
  const { url, title, snippet, bestRank, fetchState } = entry;
  if (typeof url !== 'string' || !isHttpUrl(url) || typeof title !== 'string') return undefined;
  if (typeof bestRank !== 'number' || !Number.isInteger(bestRank) || bestRank < 1) return undefined;
  const queries = entry.queries === undefined ? [] : parseStrings(entry.queries);
  if (!queries) return undefined;
  const article: RelatedArticle = { url, title, queries, bestRank };
  if (typeof snippet === 'string' && snippet !== '') article.snippet = snippet;
  if (RELATED_ARTICLE_FETCH_STATES.includes(fetchState as RelatedArticleFetchState)) {
    article.fetchState = fetchState as RelatedArticleFetchState;
  }
  return article;
}

/**
 * Parses an import file. Accepts the export envelope (`{ format, items: [...] }`) or a bare array
 * of items. Throws `ImportError` when the file is not a usable library; skips invalid records.
 */
export function parseImport(text: string): ParsedImport {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ImportError('The file is not valid JSON.');
  }

  let rawItems: unknown;
  let catalogs: Catalog[] = [];
  if (Array.isArray(data)) {
    rawItems = data;
  } else if (isRecord(data) && Array.isArray(data.items)) {
    if (data.format !== undefined && data.format !== EXPORT_FORMAT) {
      throw new ImportError(`Unknown file format "${String(data.format)}".`);
    }
    if (typeof data.version === 'number' && data.version > EXPORT_VERSION) {
      throw new ImportError(
        `The file was made by a newer version of Remember This (format v${data.version}). Update the extension first.`,
      );
    }
    rawItems = data.items;
    if (Array.isArray(data.catalogs)) {
      catalogs = data.catalogs.flatMap((entry) => parseCatalog(entry) ?? []);
    }
  } else {
    throw new ImportError('The file does not contain a Remember This library.');
  }

  const byId = new Map<string, SavedItem>();
  const rejected: ParsedImport['rejected'] = [];
  (rawItems as unknown[]).forEach((raw, index) => {
    const result = validateItem(raw);
    if (typeof result === 'string') {
      rejected.push({ index, reason: result });
      return;
    }
    const existing = byId.get(result.id);
    if (!existing || existing.timestamp < result.timestamp) byId.set(result.id, result);
  });

  if (byId.size === 0 && rejected.length > 0) {
    throw new ImportError(`No valid records found (${rejected.length} invalid).`);
  }
  return { items: [...byId.values()], catalogs, rejected };
}

export type ImportMode = 'merge' | 'replace';

export interface ImportPlan {
  toWrite: SavedItem[];
  toDelete: string[];
  added: number;
  updated: number;
  unchanged: number;
  removed: number;
}

/**
 * Computes the storage changes for an import.
 * - `merge`: adds new records; replaces an existing record only when the imported copy is newer.
 * - `replace`: the library becomes exactly the imported records.
 */
export function planImport(
  existing: readonly SavedItem[],
  incoming: readonly SavedItem[],
  mode: ImportMode,
): ImportPlan {
  const existingById = new Map(existing.map((item) => [item.id, item]));
  const plan: ImportPlan = { toWrite: [], toDelete: [], added: 0, updated: 0, unchanged: 0, removed: 0 };

  for (const item of incoming) {
    const current = existingById.get(item.id);
    if (!current) {
      plan.toWrite.push(item);
      plan.added++;
    } else if (mode === 'replace' || Date.parse(item.timestamp) > Date.parse(current.timestamp)) {
      plan.toWrite.push(item);
      plan.updated++;
    } else {
      plan.unchanged++;
    }
  }

  if (mode === 'replace') {
    const incomingIds = new Set(incoming.map((item) => item.id));
    plan.toDelete = existing.filter((item) => !incomingIds.has(item.id)).map((item) => item.id);
    plan.removed = plan.toDelete.length;
  }
  return plan;
}
