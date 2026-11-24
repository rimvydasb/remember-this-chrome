import type { SavedItem } from './types';

/** A named group of items. Each item is in exactly one catalog. */
export interface Catalog {
  id: string;
  name: string;
  /** ISO date string. */
  createdAt: string;
}

/** ID of the default catalog. New captures go here. It cannot be renamed or deleted. */
export const RECENTS_ID = 'recents';

export const RECENTS: Catalog = { id: RECENTS_ID, name: 'Recents', createdAt: '1970-01-01T00:00:00.000Z' };

/** Storage key of the user's catalogs. It has no `item:` prefix, so library operations do not touch it. */
export const CATALOGS_KEY = 'catalogs';

export const MAX_CATALOG_NAME = 60;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const sameName = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' }) === 0;

/** Validates one stored or imported catalog. Returns undefined when it is unusable. */
export function parseCatalog(value: unknown): Catalog | undefined {
  if (!isRecord(value)) return undefined;
  const { id, name, createdAt } = value;
  if (typeof id !== 'string' || id.trim() === '' || id === RECENTS_ID) return undefined;
  if (typeof name !== 'string' || name.trim() === '') return undefined;
  const created = typeof createdAt === 'string' && !Number.isNaN(Date.parse(createdAt)) ? createdAt : RECENTS.createdAt;
  return { id, name: name.trim().slice(0, MAX_CATALOG_NAME), createdAt: new Date(created).toISOString() };
}

/** Recents first, then the user's catalogs by name. Invalid and duplicate entries are dropped. */
export function normalizeCatalogs(value: unknown): Catalog[] {
  const byId = new Map<string, Catalog>();
  if (Array.isArray(value)) {
    for (const entry of value) {
      const catalog = parseCatalog(entry);
      if (catalog && !byId.has(catalog.id)) byId.set(catalog.id, catalog);
    }
  }
  const user = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  return [RECENTS, ...user];
}

/**
 * The catalog that an item is in. Items without a catalog, or with a catalog that no longer
 * exists, are in Recents.
 */
export function catalogIdOf(item: SavedItem, catalogIds: ReadonlySet<string>): string {
  return item.catalogId && catalogIds.has(item.catalogId) ? item.catalogId : RECENTS_ID;
}

/** Returns a problem with a catalog name, or null when the name can be used. */
export function catalogNameError(name: string, catalogs: readonly Catalog[], exceptId?: string): string | null {
  const trimmed = name.trim();
  if (trimmed === '') return 'Enter a name';
  if (trimmed.length > MAX_CATALOG_NAME) return `Use at most ${MAX_CATALOG_NAME} characters`;
  if (catalogs.some((catalog) => catalog.id !== exceptId && sameName(catalog.name, trimmed))) {
    return 'A catalog with this name already exists';
  }
  return null;
}

/**
 * Combines the catalogs of an import with the stored ones.
 * - `merge`: keeps the stored catalogs and adds the new ones. An imported catalog with the name of
 *   a stored catalog is joined to it: `remap` maps its ID to the stored ID.
 * - `replace`: the catalogs become exactly the imported ones.
 */
export function mergeCatalogs(
  existing: readonly Catalog[],
  incoming: readonly Catalog[],
  mode: 'merge' | 'replace',
): { catalogs: Catalog[]; remap: Map<string, string> } {
  const remap = new Map<string, string>();
  const result = mode === 'merge' ? normalizeCatalogs(existing).slice(1) : [];
  for (const catalog of normalizeCatalogs(incoming).slice(1)) {
    if (result.some((c) => c.id === catalog.id)) continue;
    // An imported catalog named like Recents (or a stored catalog) joins it.
    const named = [RECENTS, ...result].find((c) => sameName(c.name, catalog.name));
    if (named) remap.set(catalog.id, named.id);
    else result.push(catalog);
  }
  return { catalogs: normalizeCatalogs(result).slice(1), remap };
}
