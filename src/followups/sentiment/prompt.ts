import { MAX_SENTIMENTS, SENTIMENT_CATEGORIES, SENTIMENTS, type SentimentCategory } from '../../shared/sentiment';
import type { SavedItem } from '../../shared/types';

const vocabulary = (Object.keys(SENTIMENT_CATEGORIES) as SentimentCategory[])
  .map((category) => {
    const labels = SENTIMENTS.filter((sentiment) => sentiment.category === category).map((s) => s.label);
    return `- ${SENTIMENT_CATEGORIES[category].name} (${SENTIMENT_CATEGORIES[category].usage}): ${labels.join(', ')}`;
  })
  .join('\n');

export const SENTIMENT_PROMPT =
  'Analyze the sentiment of this content: the attitude and mood of the author toward the main subject. ' +
  `Choose 1 to ${MAX_SENTIMENTS} sentiments, most important first, only from this vocabulary:\n` +
  `${vocabulary}\n\n` +
  'Use the category that suits the content: for markets and investments give the market outlook first ' +
  '(for example "cautiously bullish"); use "short term bullish" or "short term bearish" when the author ' +
  'expects a move only in the coming days or weeks, and add the long-term outlook when it differs; for news give how the news is presented. ' +
  'Add a tone or opinion only when it is clear. Write each label exactly as in the vocabulary. ' +
  'Answer with the labels separated by commas and nothing else, for example: bullish, optimistic';

/** Builds the sentiment message: the prompt, then the title, the channel, the description and the text. */
export function buildSentimentMessage(item: Pick<SavedItem, 'title' | 'content' | 'meta'>): string {
  const description = item.meta?.description?.trim();
  return [
    SENTIMENT_PROMPT,
    `Title: ${item.title || 'Untitled'}`,
    item.meta?.channel ? `Channel: ${item.meta.channel}` : '',
    description ? `Description:\n${description}` : '',
    `Content:\n${item.content}`,
  ]
    .filter(Boolean)
    .join('\n\n');
}
