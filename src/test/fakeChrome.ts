import { vi } from 'vitest';

/**
 * A minimal in-memory `chrome` global for unit tests: `storage.local`, `tabs.get`, and
 * `scripting.executeScript`. Install it with `vi.stubGlobal('chrome', createFakeChrome())`.
 */
export function createFakeChrome() {
  const store = new Map<string, unknown>();
  const clone = <T>(value: T): T => structuredClone(value);

  const local = {
    store,
    get: vi.fn(async (keys: string | string[] | null) => {
      if (keys === null) return Object.fromEntries([...store].map(([k, v]) => [k, clone(v)]));
      const list = Array.isArray(keys) ? keys : [keys];
      return Object.fromEntries(list.filter((k) => store.has(k)).map((k) => [k, clone(store.get(k))]));
    }),
    getKeys: vi.fn(async () => [...store.keys()]),
    set: vi.fn(async (items: Record<string, unknown>) => {
      for (const [k, v] of Object.entries(items)) store.set(k, clone(v));
    }),
    remove: vi.fn(async (keys: string | string[]) => {
      for (const k of Array.isArray(keys) ? keys : [keys]) store.delete(k);
    }),
  };

  return {
    storage: { local },
    tabs: { get: vi.fn(async (tabId: number): Promise<{ id: number; url?: string }> => ({ id: tabId })) },
    scripting: { executeScript: vi.fn(async (): Promise<{ result?: unknown }[]> => []) },
  };
}

export type FakeChrome = ReturnType<typeof createFakeChrome>;
