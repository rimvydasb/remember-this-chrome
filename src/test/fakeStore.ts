import { vi } from 'vitest';
import type { ItemStore } from '../followups/ports';
import type { AiTags, FollowUp } from '../shared/types';

/** An `ItemStore` that records its calls. `exists` tells which item IDs the library still has. */
export function createFakeStore(exists: (itemId: string) => boolean = () => true) {
  const store = {
    followUps: [] as { itemId: string; followUp: FollowUp }[],
    tags: new Map<string, AiTags>(),
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
    setAiTags: vi.fn(async (itemId: string, tags: AiTags, options: { onlyIfMissing?: boolean } = {}) => {
      if (!exists(itemId) || (options.onlyIfMissing && store.tags.has(itemId))) return false;
      store.tags.set(itemId, tags);
      return true;
    }),
  } satisfies ItemStore & Record<string, unknown>;
  return store;
}
