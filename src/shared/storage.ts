import { planImport, type ImportMode, type ImportPlan } from './importExport';
import { sortByRecent } from './search';
import type { SavedItem } from './types';

/**
 * Each record is stored under its own key (`item:<id>`) in `chrome.storage.local`, so saving
 * one transcript does not rewrite the whole library.
 */
export const ITEM_KEY_PREFIX = 'item:';

const keyFor = (id: string) => `${ITEM_KEY_PREFIX}${id}`;

export function isItemKey(key: string): boolean {
  return key.startsWith(ITEM_KEY_PREFIX);
}

export async function getAllItems(): Promise<SavedItem[]> {
  const all = await chrome.storage.local.get(null);
  const items: SavedItem[] = [];
  for (const [key, value] of Object.entries(all)) {
    if (isItemKey(key) && value) items.push(value as SavedItem);
  }
  return sortByRecent(items);
}

export async function countItems(): Promise<number> {
  const keys = await chrome.storage.local.getKeys();
  return keys.filter(isItemKey).length;
}

export async function getItem(id: string): Promise<SavedItem | undefined> {
  const key = keyFor(id);
  const result = await chrome.storage.local.get(key);
  return result[key] as SavedItem | undefined;
}

export async function putItems(items: readonly SavedItem[]): Promise<void> {
  if (items.length === 0) return;
  await chrome.storage.local.set(Object.fromEntries(items.map((item) => [keyFor(item.id), item])));
}

export async function deleteItems(ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  await chrome.storage.local.remove(ids.map(keyFor));
}

export async function clearLibrary(): Promise<void> {
  const keys = await chrome.storage.local.getKeys();
  await chrome.storage.local.remove(keys.filter(isItemKey));
}

/**
 * Saves a capture. When the library already has an item of the same type for the same URL, the
 * item keeps its ID and gets the new content and timestamp.
 */
export async function upsertCapture(
  capture: Omit<SavedItem, 'id' | 'timestamp'>,
): Promise<{ item: SavedItem; created: boolean }> {
  const existing = (await getAllItems()).find((item) => item.url === capture.url && item.type === capture.type);
  const item: SavedItem = {
    ...capture,
    id: existing?.id ?? crypto.randomUUID(),
    timestamp: new Date().toISOString(),
  };
  await putItems([item]);
  return { item, created: !existing };
}

/** Applies an import. New data is written before stale records are removed, so a failure cannot lose data. */
export async function applyImport(incoming: readonly SavedItem[], mode: ImportMode): Promise<ImportPlan> {
  const plan = planImport(await getAllItems(), incoming, mode);
  await putItems(plan.toWrite);
  await deleteItems(plan.toDelete);
  return plan;
}
