import type { SavedItem } from '../../shared/types';

export const TAG_PROMPT =
  'List the main topics of this transcript as tags for a personal library. ' +
  'Give 5 to 10 tags, most important first. A tag is a noun or a short noun phrase of 1 to 3 words ' +
  '(for example "AI agents", "TypeScript", "code review"). ' +
  'Name what the content is about, not words that are only said often. ' +
  'Do not use generic tags such as "video", "discussion" or "technology", and do not use the channel name. ' +
  'Write tags in lowercase, except names and acronyms. ' +
  'Answer with a JSON array of strings only, for example ["AI agents", "software engineering"].';

/** Builds the tagging message: the prompt, then the title, the description and the text. */
export function buildTagMessage(item: Pick<SavedItem, 'title' | 'content' | 'meta'>): string {
  const description = item.meta?.description?.trim();
  return [
    TAG_PROMPT,
    `Title: ${item.title || 'Untitled'}`,
    item.meta?.channel ? `Channel: ${item.meta.channel}` : '',
    description ? `Description:\n${description}` : '',
    `Transcript:\n${item.content}`,
  ]
    .filter(Boolean)
    .join('\n\n');
}
