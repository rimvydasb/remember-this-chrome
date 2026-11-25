import type { AiTags, FollowUp } from '../shared/types';

/**
 * What the pipelines need from the library. The storage module implements it; tests pass a fake.
 * Every method resolves to false (or nothing) when the item no longer exists.
 */
export interface ItemStore {
  addFollowUp(itemId: string, followUp: FollowUp): Promise<boolean>;
  updateFollowUp(itemId: string, followUpId: string, patch: Partial<Omit<FollowUp, 'id' | 'type'>>): Promise<boolean>;
  deleteFollowUp(itemId: string, followUpId: string): Promise<void>;
  setAiTags(itemId: string, tags: AiTags, options?: { onlyIfMissing?: boolean }): Promise<boolean>;
}
