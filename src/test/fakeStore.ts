import { vi } from 'vitest';
import type { ItemStore } from '../followups/ports';
import type { FollowUp, Tag, TagSource } from '../shared/types';

/** An `ItemStore` that records its calls. `exists` tells which item IDs the library still has. */
export function createFakeStore(exists: (itemId: string) => boolean = () => true) {
  const store = {
    followUps: [] as { itemId: string; followUp: FollowUp }[],
    /** Stored tags by item ID, then by source. */
    tags: new Map<string, Map<TagSource, readonly Tag[]>>(),
    addFollowUp: vi.fn(async (itemId: string, followUp: FollowUp) => {
      if (!exists(itemId)) return false;
      store.followUps.push({ itemId, followUp });
      return true;
    }),
    updateFollowUp: vi.fn(async (itemId: string, id: string, patch: Partial<FollowUp>) => {
      const entry = store.followUps.find((e) => e.itemId === itemId && e.followUp.id === id);
      if (!entry) return false;
      Object.assign(entry.followUp, patch);
      return true;
    }),
    deleteFollowUp: vi.fn(async (itemId: string, id: string) => {
      store.followUps = store.followUps.filter((e) => !(e.itemId === itemId && e.followUp.id === id));
    }),
    setTags: vi.fn(
      async (itemId: string, source: TagSource, tags: readonly Tag[], options: { onlyIfMissing?: boolean } = {}) => {
        const own = store.tags.get(itemId) ?? new Map<TagSource, readonly Tag[]>();
        if (!exists(itemId) || (options.onlyIfMissing && (own.get(source)?.length ?? 0) > 0)) return false;
        if (tags.length > 0) own.set(source, tags);
        else own.delete(source);
        store.tags.set(itemId, own);
        return true;
      },
    ),
  } satisfies ItemStore & Record<string, unknown>;
  return store;
}
