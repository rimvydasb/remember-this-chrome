/**
 * The sentiment vocabulary: the labels that the sentiment follow-up can put on an item. Each
 * label belongs to one category (what kind of content it describes) and has one mood (how
 * positive it is). The UI picks the icon by category and the color by mood.
 */

/** What kind of content a sentiment describes. */
export type SentimentCategory = 'market' | 'news' | 'opinion' | 'review' | 'tone';

/** How positive a sentiment is. */
export type SentimentMood = 'positive' | 'leaning-positive' | 'neutral' | 'mixed' | 'leaning-negative' | 'negative';

export interface SentimentDefinition {
  /** The label, in lowercase; unique over the whole vocabulary. */
  label: string;
  category: SentimentCategory;
  mood: SentimentMood;
  /** Other spellings that a model may answer with, in lowercase. */
  aliases?: readonly string[];
}

/** Most sentiments kept for one item. */
export const MAX_SENTIMENTS = 3;

export const SENTIMENT_CATEGORIES: Readonly<Record<SentimentCategory, { name: string; usage: string }>> = {
  market: { name: 'Market', usage: 'the author’s outlook on markets, stocks, crypto, the economy or investments' },
  news: { name: 'News', usage: 'how news or current events are presented' },
  opinion: {
    name: 'Opinion',
    usage: 'the author’s stance toward the main subject (a person, product, idea or policy)',
  },
  review: { name: 'Review', usage: 'the verdict of a product, service, book, film or game review' },
  tone: { name: 'Tone', usage: 'the general emotional tone; fits any content' },
};

export const SENTIMENTS: readonly SentimentDefinition[] = [
  // Market
  { label: 'bullish', category: 'market', mood: 'positive' },
  {
    label: 'cautiously bullish',
    category: 'market',
    mood: 'leaning-positive',
    aliases: ['cautious bullish', 'cautiously optimistic bullish', 'moderately bullish', 'mildly bullish'],
  },
  {
    label: 'short term bullish',
    category: 'market',
    mood: 'leaning-positive',
    aliases: ['near term bullish', 'bullish short term', 'bullish in the short term'],
  },
  { label: 'neutral', category: 'market', mood: 'neutral', aliases: ['market neutral', 'sideways'] },
  {
    label: 'cautiously bearish',
    category: 'market',
    mood: 'leaning-negative',
    aliases: ['cautious bearish', 'moderately bearish', 'mildly bearish'],
  },
  {
    label: 'short term bearish',
    category: 'market',
    mood: 'leaning-negative',
    aliases: ['near term bearish', 'bearish short term', 'bearish in the short term'],
  },
  { label: 'bearish', category: 'market', mood: 'negative' },
  { label: 'uncertain', category: 'market', mood: 'mixed', aliases: ['mixed outlook', 'volatile'] },
  // News
  { label: 'positive', category: 'news', mood: 'positive', aliases: ['good news'] },
  { label: 'hopeful', category: 'news', mood: 'leaning-positive' },
  { label: 'balanced', category: 'news', mood: 'neutral', aliases: ['factual', 'objective'] },
  { label: 'concerning', category: 'news', mood: 'leaning-negative', aliases: ['worrying'] },
  { label: 'negative', category: 'news', mood: 'negative', aliases: ['bad news'] },
  { label: 'alarming', category: 'news', mood: 'negative', aliases: ['alarmist'] },
  // Opinion
  { label: 'enthusiastic', category: 'opinion', mood: 'positive' },
  { label: 'supportive', category: 'opinion', mood: 'leaning-positive', aliases: ['favorable', 'favourable'] },
  { label: 'skeptical', category: 'opinion', mood: 'leaning-negative', aliases: ['sceptical'] },
  { label: 'critical', category: 'opinion', mood: 'negative' },
  { label: 'controversial', category: 'opinion', mood: 'mixed', aliases: ['polarizing', 'polarising'] },
  // Review
  { label: 'recommended', category: 'review', mood: 'positive', aliases: ['recommend'] },
  { label: 'mixed review', category: 'review', mood: 'mixed' },
  { label: 'not recommended', category: 'review', mood: 'negative', aliases: ['not recommend'] },
  // Tone
  { label: 'optimistic', category: 'tone', mood: 'positive' },
  { label: 'inspiring', category: 'tone', mood: 'positive', aliases: ['inspirational', 'motivational'] },
  { label: 'humorous', category: 'tone', mood: 'positive', aliases: ['funny', 'playful'] },
  { label: 'informative', category: 'tone', mood: 'neutral', aliases: ['educational'] },
  { label: 'calm', category: 'tone', mood: 'neutral' },
  { label: 'nostalgic', category: 'tone', mood: 'mixed' },
  { label: 'anxious', category: 'tone', mood: 'leaning-negative', aliases: ['worried', 'fearful'] },
  { label: 'pessimistic', category: 'tone', mood: 'negative' },
  { label: 'angry', category: 'tone', mood: 'negative', aliases: ['outraged'] },
  { label: 'sad', category: 'tone', mood: 'negative', aliases: ['somber', 'sombre'] },
];

const normalize = (text: string) =>
  text
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/[^a-z ]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const BY_NAME = new Map<string, SentimentDefinition>();
for (const sentiment of SENTIMENTS) {
  for (const name of [sentiment.label, ...(sentiment.aliases ?? [])]) BY_NAME.set(normalize(name), sentiment);
}

/** The vocabulary entry with this label or alias, ignoring case, hyphens and punctuation. */
export function findSentiment(text: string): SentimentDefinition | undefined {
  return BY_NAME.get(normalize(text));
}

/**
 * Reads the sentiments from a model answer: labels separated by commas (or new lines). Keeps the
 * labels of the vocabulary in the order given, without duplicates, at most `MAX_SENTIMENTS`.
 */
export function parseSentiments(answer: string): SentimentDefinition[] {
  const result: SentimentDefinition[] = [];
  for (const entry of answer.replace(/```\w*/g, '').split(/[,\n;]/)) {
    const sentiment = findSentiment(entry.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, ''));
    if (!sentiment || result.includes(sentiment)) continue;
    result.push(sentiment);
    if (result.length >= MAX_SENTIMENTS) break;
  }
  return result;
}

/** The sentiments as the model is to write them, and as the follow-up stores them. */
export function formatSentiments(sentiments: readonly SentimentDefinition[]): string {
  return sentiments.map((sentiment) => sentiment.label).join(', ');
}
