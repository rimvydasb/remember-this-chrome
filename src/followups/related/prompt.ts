import type { PromptItem } from '../../shared/promptModel';

/** Most search queries kept from an answer. */
export const MAX_QUERIES = 5;

export const QUERY_PROMPT =
  'Write 3 to 5 Google search queries that find written articles (news, studies, blog posts, documentation) ' +
  'about the claims and topics of this transcript or page text. ' +
  'Each query has 3 to 10 words. ' +
  'The queries cover different sub-topics; they are not paraphrases of one topic. ' +
  'Use names, terms and numbers from the text. Do not use the channel name, and do not search for videos. ' +
  'Answer with a JSON array of strings only, for example ["sleep deprivation hippocampus memory study", "caffeine reverses social memory loss"].';

/** Text of the item sent with the prompt. Long transcripts are cut: the queries need the topics, not every word. */
const MAX_TEXT_CHARS = 24_000;

/** Builds the query message: the prompt, then the title, the channel, the description and the text. */
export function buildQueryMessage(item: PromptItem): string {
  const description = item.meta?.description?.trim();
  const label = item.type === 'youtube_transcript' ? 'Transcript' : 'Page text';
  return [
    QUERY_PROMPT,
    `Title: ${item.title || 'Untitled'}`,
    item.meta?.channel ? `Channel: ${item.meta.channel}` : '',
    description ? `Description:\n${description}` : '',
    `${label}:\n${item.content.slice(0, MAX_TEXT_CHARS)}`,
  ]
    .filter(Boolean)
    .join('\n\n');
}
