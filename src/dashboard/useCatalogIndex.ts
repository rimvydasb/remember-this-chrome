import { useMemo } from 'react';
import { catalogIdOf, type Catalog } from '../shared/catalogs';
import type { SavedItem } from '../shared/types';

export interface CatalogStats {
  /** Items in the catalog that are not forgotten. */
  count: number;
  /** Items in the catalog, forgotten ones included. */
  total: number;
  /** ISO date of the newest item, when there is one. */
  latest?: string;
  /** Thumbnails of the newest items, at most four. */
  thumbnails: string[];
}

export interface CatalogIndex {
  /** The catalog of each item, by item ID. */
  catalogOf: ReadonlyMap<string, string>;
  stats: ReadonlyMap<string, CatalogStats>;
}

const MOSAIC = 4;

/** Groups the items by catalog. `items` must be newest first. */
export function useCatalogIndex(items: readonly SavedItem[], catalogs: readonly Catalog[]): CatalogIndex {
  return useMemo(() => {
    const ids = new Set(catalogs.map((catalog) => catalog.id));
    const catalogOf = new Map<string, string>();
    const stats = new Map<string, CatalogStats>(catalogs.map((c) => [c.id, { count: 0, total: 0, thumbnails: [] }]));
    for (const item of items) {
      const id = catalogIdOf(item, ids);
      catalogOf.set(item.id, id);
      const entry = stats.get(id)!;
      entry.total++;
      if (item.mark === 'forgotten') continue;
      entry.count++;
      entry.latest ??= item.timestamp;
      const thumbnail = item.meta?.thumbnail;
      if (thumbnail && entry.thumbnails.length < MOSAIC) entry.thumbnails.push(thumbnail);
    }
    return { catalogOf, stats };
  }, [items, catalogs]);
}
