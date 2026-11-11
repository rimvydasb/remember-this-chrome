import { useEffect, useState } from 'react';
import { sortByRecent } from '../shared/search';
import { getAllItems, isItemKey, ITEM_KEY_PREFIX } from '../shared/storage';
import type { SavedItem } from '../shared/types';

/** Loads the library and keeps it in sync with `chrome.storage.local` (captures, imports, deletes). */
export function useLibrary(): SavedItem[] | null {
  const [items, setItems] = useState<SavedItem[] | null>(null);

  useEffect(() => {
    let active = true;
    getAllItems().then((loaded) => {
      if (active) setItems(loaded);
    });

    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== 'local') return;
      const relevant = Object.entries(changes).filter(([key]) => isItemKey(key));
      if (relevant.length === 0) return;
      setItems((previous) => {
        const byId = new Map((previous ?? []).map((item) => [item.id, item]));
        for (const [key, change] of relevant) {
          const id = key.slice(ITEM_KEY_PREFIX.length);
          if (change.newValue) byId.set(id, change.newValue as SavedItem);
          else byId.delete(id);
        }
        return sortByRecent([...byId.values()]);
      });
    };
    chrome.storage.onChanged.addListener(onChanged);
    return () => {
      active = false;
      chrome.storage.onChanged.removeListener(onChanged);
    };
  }, []);

  return items;
}
