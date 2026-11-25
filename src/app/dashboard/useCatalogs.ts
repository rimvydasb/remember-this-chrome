import { useEffect, useState } from 'react';
import { CATALOGS_KEY, normalizeCatalogs, type Catalog } from '../../shared/catalogs';
import { getCatalogs } from '../../shared/storage';

/**
 * Loads the catalogs (Recents first) and keeps them in sync with `chrome.storage.local`.
 * Returns null while loading.
 */
export function useCatalogs(): Catalog[] | null {
  const [catalogs, setCatalogs] = useState<Catalog[] | null>(null);

  useEffect(() => {
    let active = true;
    getCatalogs().then((loaded) => {
      if (active) setCatalogs(loaded);
    });
    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && CATALOGS_KEY in changes) setCatalogs(normalizeCatalogs(changes[CATALOGS_KEY]!.newValue));
    };
    chrome.storage.onChanged.addListener(onChanged);
    return () => {
      active = false;
      chrome.storage.onChanged.removeListener(onChanged);
    };
  }, []);

  return catalogs;
}
