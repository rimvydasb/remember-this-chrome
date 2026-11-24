import { CATALOGS_KEY, mergeCatalogs, normalizeCatalogs, RECENTS_ID, type Catalog } from './catalogs';
import { planImport, type ImportMode, type ImportPlan } from './importExport';
import { sortByRecent } from './search';
import { mergeCapture, type Capture, type CaptureField } from './mergeCapture';
import type { AiTags, FollowUp, ItemMark, ItemType, SavedItem } from './types';

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

/** Returns the saved item of `type` for `url`, if the library has one. */
export async function findCapture(url: string, type: ItemType): Promise<SavedItem | undefined> {
  return (await getAllItems()).find((item) => item.url === url && item.type === type);
}

/**
 * Saves a capture. When the library already has an item of the same type for the same URL, the
 * item keeps its ID and is updated by the rules of `mergeCapture`: parts that the new capture
 * could not read keep their stored values.
 */
export async function upsertCapture(
  capture: Capture,
  options: { fallbackTitle?: string } = {},
): Promise<{ item: SavedItem; created: boolean; changed: CaptureField[] }> {
  const existing = await findCapture(capture.url, capture.type);
  const { item, changed } = mergeCapture(existing, capture, {
    id: existing?.id ?? crypto.randomUUID(),
    now: new Date(),
    fallbackTitle: options.fallbackTitle,
  });
  await putItems([item]);
  return { item, created: !existing, changed };
}

/** Attaches a follow-up to an item. Returns false when the item no longer exists. */
export async function addFollowUp(itemId: string, followUp: FollowUp): Promise<boolean> {
  const item = await getItem(itemId);
  if (!item) return false;
  await putItems([{ ...item, followUps: [...(item.followUps ?? []), followUp] }]);
  return true;
}

/**
 * Stores LLM-generated tags on an item. With `onlyIfMissing`, an item that already has AI tags is
 * left alone (another dashboard tab may have tagged it). Returns false when nothing was stored.
 */
export async function setAiTags(
  itemId: string,
  aiTags: AiTags,
  options: { onlyIfMissing?: boolean } = {},
): Promise<boolean> {
  const item = await getItem(itemId);
  if (!item || (options.onlyIfMissing && item.aiTags)) return false;
  await putItems([{ ...item, aiTags }]);
  return true;
}

/** Removes a follow-up from an item. */
export async function deleteFollowUp(itemId: string, followUpId: string): Promise<void> {
  const item = await getItem(itemId);
  if (!item?.followUps) return;
  const followUps = item.followUps.filter((followUp) => followUp.id !== followUpId);
  const next: SavedItem = { ...item, followUps };
  if (followUps.length === 0) delete next.followUps;
  await putItems([next]);
}

/** Sets the mark of the given items, or removes it when `mark` is undefined. Missing items are skipped. */
export async function setItemsMark(ids: readonly string[], mark: ItemMark | undefined): Promise<void> {
  if (ids.length === 0) return;
  const keys = ids.map(keyFor);
  const stored = await chrome.storage.local.get(keys);
  const next: SavedItem[] = [];
  for (const key of keys) {
    const item = stored[key] as SavedItem | undefined;
    if (!item) continue;
    const updated: SavedItem = { ...item, mark };
    if (!mark) delete updated.mark;
    next.push(updated);
  }
  await putItems(next);
}

/** Deletes the given items, but only those marked as forgotten. Returns the IDs that were deleted. */
export async function deleteForgottenItems(ids: readonly string[]): Promise<string[]> {
  const keys = ids.map(keyFor);
  const stored = await chrome.storage.local.get(keys);
  const forgotten = ids.filter((id) => (stored[keyFor(id)] as SavedItem | undefined)?.mark === 'forgotten');
  await deleteItems(forgotten);
  return forgotten;
}

/**
 * Applies an import. New data is written before stale records are removed, so a failure cannot lose data.
 * Catalogs are combined by the rules of `mergeCatalogs`.
 */
export async function applyImport(
  incoming: readonly SavedItem[],
  mode: ImportMode,
  incomingCatalogs: readonly Catalog[] = [],
): Promise<ImportPlan> {
  const { catalogs, remap } = mergeCatalogs(await getCatalogs(), incomingCatalogs, mode);
  const items =
    remap.size === 0
      ? incoming
      : incoming.map((item) => withCatalog(item, remap.get(item.catalogId ?? '') ?? item.catalogId));
  await saveCatalogs(catalogs);
  const plan = planImport(await getAllItems(), items, mode);
  await putItems(plan.toWrite);
  await deleteItems(plan.toDelete);
  return plan;
}

/** Returns a copy of the item in the given catalog. Recents (or undefined) removes the field. */
function withCatalog(item: SavedItem, catalogId: string | undefined): SavedItem {
  const next: SavedItem = { ...item, catalogId };
  if (!catalogId || catalogId === RECENTS_ID) delete next.catalogId;
  return next;
}

/** All catalogs: Recents first, then the user's catalogs by name. */
export async function getCatalogs(): Promise<Catalog[]> {
  const result = await chrome.storage.local.get(CATALOGS_KEY);
  return normalizeCatalogs(result[CATALOGS_KEY]);
}

async function saveCatalogs(catalogs: readonly Catalog[]): Promise<void> {
  // Recents is implied and never stored.
  await chrome.storage.local.set({ [CATALOGS_KEY]: normalizeCatalogs(catalogs).slice(1) });
}

export async function createCatalog(name: string, now = new Date()): Promise<Catalog> {
  const catalog: Catalog = { id: crypto.randomUUID(), name: name.trim(), createdAt: now.toISOString() };
  await saveCatalogs([...(await getCatalogs()), catalog]);
  return catalog;
}

/** Renames a catalog. Recents cannot be renamed. */
export async function renameCatalog(id: string, name: string): Promise<void> {
  if (id === RECENTS_ID) return;
  const catalogs = await getCatalogs();
  await saveCatalogs(catalogs.map((catalog) => (catalog.id === id ? { ...catalog, name: name.trim() } : catalog)));
}

/**
 * Deletes a catalog and moves its items to Recents. Recents cannot be deleted. Items are moved
 * first; an item that still names a missing catalog is in Recents anyway.
 */
export async function deleteCatalog(id: string): Promise<number> {
  if (id === RECENTS_ID) return 0;
  const moved = (await getAllItems()).filter((item) => item.catalogId === id);
  await putItems(moved.map((item) => withCatalog(item, undefined)));
  await saveCatalogs((await getCatalogs()).filter((catalog) => catalog.id !== id));
  return moved.length;
}

/** Moves items to a catalog. Missing items are skipped. */
export async function moveItemsToCatalog(ids: readonly string[], catalogId: string): Promise<void> {
  if (ids.length === 0) return;
  const keys = ids.map(keyFor);
  const stored = await chrome.storage.local.get(keys);
  const next: SavedItem[] = [];
  for (const key of keys) {
    const item = stored[key] as SavedItem | undefined;
    if (item) next.push(withCatalog(item, catalogId));
  }
  await putItems(next);
}
