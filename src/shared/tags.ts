import { parseSentiments } from './sentiment';
import type { SavedItem, Tag, TagKind, TagSource } from './types';

/** The kind of the tags that each source makes. */
export const SOURCE_KIND: Readonly<Record<TagSource, TagKind>> = {
  'ai-topics': 'topic',
  'ai-sentiment': 'sentiment',
};

/** The stored tags of an item from one source, in stored order. */
export function tagsFrom(item: Pick<SavedItem, 'tags'>, source: TagSource): Tag[] {
  return (item.tags ?? []).filter((tag) => tag.source === source);
}

/** The labels of the stored tags of an item of one kind, in stored order. */
export function tagLabels(item: Pick<SavedItem, 'tags'>, kind: TagKind): string[] {
  return (item.tags ?? []).filter((tag) => tag.kind === kind).map((tag) => tag.label);
}

/** True when the item has stored tags from the source. */
export const hasTagsFrom = (item: Pick<SavedItem, 'tags'>, source: TagSource): boolean =>
  (item.tags ?? []).some((tag) => tag.source === source);

/** True when the item has stored topic tags, so its topics do not come from keyword extraction. */
export const hasTopicTags = (item: Pick<SavedItem, 'tags'>): boolean =>
  (item.tags ?? []).some((tag) => tag.kind === 'topic');

/** New tags of a source, all with the same model and time. Empty and repeated labels are dropped. */
export function createTags(
  source: TagSource,
  labels: readonly string[],
  options: { model?: string; createdAt?: string } = {},
): Tag[] {
  const createdAt = options.createdAt ?? new Date().toISOString();
  const seen = new Set<string>();
  const tags: Tag[] = [];
  for (const raw of labels) {
    const label = raw.trim().replace(/\s+/g, ' ');
    const key = label.toLowerCase();
    if (!label || seen.has(key)) continue;
    seen.add(key);
    const tag: Tag = { label, kind: SOURCE_KIND[source], source, createdAt };
    if (options.model) tag.model = options.model;
    tags.push(tag);
  }
  return tags;
}

/** The item's tags with those of `source` replaced by `tags`. Tags of other sources keep their place. */
export function replaceTags(item: Pick<SavedItem, 'tags'>, source: TagSource, tags: readonly Tag[]): Tag[] {
  return [...(item.tags ?? []).filter((tag) => tag.source !== source), ...tags];
}

/** Returns a copy of the item with the given tags; an empty list removes the field. */
export function withTags<T extends Pick<SavedItem, 'tags'>>(item: T, tags: readonly Tag[]): T {
  const next: Pick<SavedItem, 'tags'> = { ...item, tags: [...tags] };
  if (tags.length === 0) delete next.tags;
  return next as T;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const validDate = (value: unknown): value is string => typeof value === 'string' && !Number.isNaN(Date.parse(value));

/**
 * Converts the tags of records stored or exported before `tags` existed: `aiTags` (`{ tags,
 * model, createdAt }`) and the latest `llm-sentiment` follow-up (comma-separated labels in
 * `generatedContent`). Returns the record without the old fields, or the same record when it has none.
 */
export function upgradeLegacyTags<T extends Record<string, unknown>>(record: T): T {
  const followUps = Array.isArray(record.followUps) ? (record.followUps as unknown[]) : undefined;
  const isSentiment = (entry: unknown) => isRecord(entry) && entry.type === 'llm-sentiment';
  if (!('aiTags' in record) && !followUps?.some(isSentiment)) return record;

  const { aiTags, ...rest } = record as T & { aiTags?: unknown };
  const next = rest as Record<string, unknown>;
  const tags: Tag[] = Array.isArray(record.tags) ? [...(record.tags as Tag[])] : [];

  if (isRecord(aiTags) && Array.isArray(aiTags.tags) && validDate(aiTags.createdAt) && !hasTopicTags({ tags })) {
    const labels = aiTags.tags.filter((tag): tag is string => typeof tag === 'string');
    const model = typeof aiTags.model === 'string' ? aiTags.model : undefined;
    tags.push(...createTags('ai-topics', labels, { model, createdAt: aiTags.createdAt }));
  }

  if (followUps) {
    const sentiment = followUps.filter(isSentiment).at(-1) as Record<string, unknown> | undefined;
    const content = sentiment?.generatedContent ?? sentiment?.content;
    if (
      sentiment &&
      typeof content === 'string' &&
      validDate(sentiment.createdAt) &&
      !hasTagsFrom({ tags }, 'ai-sentiment')
    ) {
      const labels = parseSentiments(content).map((entry) => entry.label);
      const model = typeof sentiment.model === 'string' ? sentiment.model : undefined;
      tags.push(...createTags('ai-sentiment', labels, { model, createdAt: sentiment.createdAt }));
    }
    const kept = followUps.filter((entry) => !isSentiment(entry));
    if (kept.length > 0) next.followUps = kept;
    else delete next.followUps;
  }

  if (tags.length > 0) next.tags = tags;
  else delete next.tags;
  return next as T;
}
