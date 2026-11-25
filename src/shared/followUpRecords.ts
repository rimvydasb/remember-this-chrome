import type { FollowUp, FollowUpType, SavedItem } from './types';

/** The follow-ups of an item with the given type, oldest first. */
export function followUpsOfType(item: Pick<SavedItem, 'followUps'>, type: FollowUpType): FollowUp[] {
  return (item.followUps ?? []).filter((followUp) => followUp.type === type);
}

/** A new follow-up with a fresh id and the current time. */
export function createFollowUp(
  type: FollowUpType,
  fields: Partial<Omit<FollowUp, 'id' | 'type' | 'createdAt'>> = {},
): FollowUp {
  return { id: crypto.randomUUID(), type, generatedContent: '', createdAt: new Date().toISOString(), ...fields };
}
