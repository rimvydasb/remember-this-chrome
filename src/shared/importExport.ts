import {
  FOLLOW_UP_TYPES,
  ITEM_TYPES,
  type FollowUp,
  type FollowUpType,
  type ItemMeta,
  type ItemType,
  type SavedItem,
} from './types';

export const EXPORT_FORMAT = 'remember-this-library';
export const EXPORT_VERSION = 1;

export interface ExportPayload {
  format: typeof EXPORT_FORMAT;
  version: number;
  exportedAt: string;
  count: number;
  items: SavedItem[];
}

export function buildExportPayload(items: readonly SavedItem[], now = new Date()): ExportPayload {
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: now.toISOString(),
    count: items.length,
    items: [...items],
  };
}

export class ImportError extends Error {}

export interface ParsedImport {
  items: SavedItem[];
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
  return item;
}

function parseFollowUp(entry: Record<string, unknown>): FollowUp | undefined {
  const { id, type, content, createdAt, model } = entry;
  if (typeof id !== 'string' || id.trim() === '') return undefined;
  if (typeof type !== 'string' || !FOLLOW_UP_TYPES.includes(type as FollowUpType)) return undefined;
  if (typeof content !== 'string') return undefined;
  if (typeof createdAt !== 'string' || Number.isNaN(Date.parse(createdAt))) return undefined;
  const followUp: FollowUp = {
    id,
    type: type as FollowUpType,
    content,
    createdAt: new Date(createdAt).toISOString(),
  };
  if (typeof model === 'string' && model !== '') followUp.model = model;
  return followUp;
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
  return { items: [...byId.values()], rejected };
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
