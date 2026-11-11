import { useEffect, useState } from 'react';
import { getSettings, normalizeSettings, SETTINGS_KEY, type Settings } from '../shared/settings';

/** Loads the settings and keeps them in sync with `chrome.storage.local`. Null while loading. */
export function useSettings(): Settings | null {
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    let active = true;
    getSettings().then((loaded) => {
      if (active) setSettings(loaded);
    });
    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && SETTINGS_KEY in changes) setSettings(normalizeSettings(changes[SETTINGS_KEY]!.newValue));
    };
    chrome.storage.onChanged.addListener(onChanged);
    return () => {
      active = false;
      chrome.storage.onChanged.removeListener(onChanged);
    };
  }, []);

  return settings;
}
