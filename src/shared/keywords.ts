import { extract, getStopwords, supported_language_codes } from 'keyword-extractor';
import type { SavedItem } from './types';

/**
 * Keyword extraction for the library.
 *
 * `keyword-extractor` cleans and tokenizes the text (punctuation, digits, case) and supplies the
 * stopword lists. Its own stopword check is a linear `indexOf` per word, which is too slow for
 * transcript-sized text, so the stopwords are applied here through a `Set` instead.
 *
 * Keywords are ranked by TF-IDF across the library, so words that appear in every transcript
 * ("people", "actually") rank below the words that make one item different from the others.
 */

export type KeywordKind = 'channel' | 'topic';

export interface Keyword {
  /** Stable filter key: `channel:<name>` or `topic:<word>`. */
  key: string;
  kind: KeywordKind;
  /** Display text. */
  label: string;
}

/** Number of keywords kept per item. The list shows the first few; filters use all of them. */
export const KEYWORDS_PER_ITEM = 10;

/** Filler words that are common in spoken transcripts but are missing from the stopword lists. */
const TRANSCRIPT_FILLERS = [
  'yeah',
  'yes',
  'okay',
  'ok',
  'um',
  'uh',
  'uhm',
  'hmm',
  'oh',
  'ah',
  'gonna',
  'wanna',
  'gotta',
  'kinda',
  'sorta',
  'like',
  'just',
  'really',
  'actually',
  'basically',
  'literally',
  'thing',
  'things',
  'stuff',
  'lot',
  'lots',
  'know',
  'mean',
  'right',
  'well',
  'got',
  'get',
  'getting',
  'go',
  'going',
  'goes',
  'went',
  'gone',
  'say',
  'said',
  'says',
  'saying',
  'think',
  'thinking',
  'thought',
  'want',
  'wanted',
  'make',
  'makes',
  'made',
  'making',
  'way',
  'ways',
  'look',
  'looking',
  'see',
  'seen',
  'come',
  'coming',
  'came',
  'take',
  'took',
  'put',
  'let',
  'lets',
  "let's",
  'kind',
  'sort',
  'bit',
  'pretty',
  'maybe',
  'probably',
  'definitely',
  'something',
  'anything',
  'everything',
  'nothing',
  'someone',
  'everybody',
  'somebody',
  'anyone',
  'one',
  'two',
  'three',
  'first',
  'second',
  'also',
  'even',
  'still',
  'much',
  'many',
  'lot',
  'good',
  'great',
  'thank',
  'thanks',
  'guys',
  'guy',
  'today',
  'video',
  'videos',
  'channel',
  'subscribe',
  'music',
  'applause',
  'laughter',
  'need',
  'use',
  'used',
  'using',
  'try',
  'trying',
  'tell',
  'talk',
  'talking',
  'started',
  'start',
  'yet',
  'time',
  'times',
  'day',
  'can',
  "can't",
  'cannot',
  "don't",
  "doesn't",
  "didn't",
  "it's",
  "i'm",
  "that's",
  "you're",
  "we're",
  "they're",
  "there's",
  "what's",
  "i've",
  "you've",
  "we've",
  "i'll",
  "you'll",
  "we'll",
  "isn't",
  "aren't",
  "wasn't",
  "won't",
  "wouldn't",
  "couldn't",
  "shouldn't",
  "here's",
  'gets',
  'okay',
  'whatever',
  'able',
  'every',
  'back',
  'around',
  'different',
  'little',
  'big',
  'new',
  'old',
  'last',
  'next',
  'sure',
  'kind',
  'year',
  'years',
  'people',
  'person',
];

/** A language code that keyword-extractor has stopwords for. */
type LanguageCode = NonNullable<NonNullable<Parameters<typeof getStopwords>[0]>['language']>;

const isSupported = (code: string): code is LanguageCode => supported_language_codes.includes(code);

/** English language names (as YouTube shows them) to ISO 639-1 codes that keyword-extractor supports. */
const LANGUAGE_NAMES: Record<string, LanguageCode> = {
  arabic: 'ar',
  czech: 'cs',
  danish: 'da',
  german: 'de',
  english: 'en',
  spanish: 'es',
  persian: 'fa',
  french: 'fr',
  galician: 'gl',
  italian: 'it',
  korean: 'ko',
  dutch: 'nl',
  polish: 'pl',
  portuguese: 'pt',
  romanian: 'ro',
  russian: 'ru',
  swedish: 'sv',
  turkish: 'tr',
  vietnamese: 'vi',
};

/** Maps an item's language (a code such as `de-DE` or a name such as `German (auto-generated)`) to a supported code. */
export function languageCode(language: string | undefined): LanguageCode {
  if (!language) return 'en';
  const lower = language.trim().toLowerCase();
  const code = lower.split(/[-_]/)[0] ?? '';
  if (isSupported(code)) return code;
  const name = lower.split(/[\s(]/)[0] ?? '';
  return LANGUAGE_NAMES[name] ?? 'en';
}

const stopwordCache = new Map<string, Set<string>>();

function stopwordsFor(language: LanguageCode): Set<string> {
  let set = stopwordCache.get(language);
  if (!set) {
    set = new Set([...getStopwords({ language }), ...(language === 'en' ? [] : getStopwords({ language: 'en' }))]);
    for (const word of TRANSCRIPT_FILLERS) set.add(word);
    stopwordCache.set(language, set);
  }
  return set;
}

/** Strips leftover punctuation that keyword-extractor keeps (brackets, dashes, quotes at the edges). */
const EDGE_PUNCTUATION = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;
const HAS_LETTER = /\p{L}/u;

/** Counts the non-stopword terms of a text. */
export function termFrequencies(text: string, language: LanguageCode = 'en'): Map<string, number> {
  const stopwords = stopwordsFor(language);
  // An empty stopword list makes keyword-extractor tokenize and normalize only; the Set filters below.
  const tokens = extract(text, { language, remove_digits: true, return_changed_case: true, stopwords: [] });
  const counts = new Map<string, number>();
  for (const raw of tokens) {
    const word = raw.replace(EDGE_PUNCTUATION, '');
    if (word.length < 3 || word.length > 40 || !HAS_LETTER.test(word) || stopwords.has(word)) continue;
    // Possessives: "einstein's" counts as "einstein".
    const term = word.endsWith("'s") ? word.slice(0, -2) : word;
    if (term.length < 3 || stopwords.has(term)) continue;
    counts.set(term, (counts.get(term) ?? 0) + 1);
  }
  return counts;
}

interface ItemTerms {
  /** Terms sorted by count, at most `MAX_TERMS_PER_ITEM`. */
  terms: [string, number][];
  total: number;
}

/** Only the most frequent terms of an item are candidates. Keeps memory and the IDF pass small. */
const MAX_TERMS_PER_ITEM = 60;

function itemTerms(item: SavedItem): ItemTerms {
  const counts = termFrequencies(`${item.title}\n${item.title}\n${item.content}`, languageCode(item.meta?.language));
  let total = 0;
  for (const count of counts.values()) total += count;
  const terms = [...counts].sort((a, b) => b[1] - a[1]).slice(0, MAX_TERMS_PER_ITEM);
  return { terms, total };
}

export const channelKey = (channel: string) => `channel:${channel.trim().toLowerCase()}`;
export const topicKey = (term: string) => `topic:${term}`;

export type KeywordIndex = Map<string, Keyword[]>;
export type TermCache = Map<string, ItemTerms>;

const cacheKey = (item: SavedItem) => `${item.id}\u0000${item.timestamp}`;

/**
 * Tokenizes the items that are not in `cache` yet, until `shouldStop` returns true.
 * Returns true when every item is cached. Lets the UI spread a large first run over several frames.
 */
export function warmTermCache(items: readonly SavedItem[], cache: TermCache, shouldStop: () => boolean): boolean {
  for (const item of items) {
    const key = cacheKey(item);
    if (cache.has(key)) continue;
    if (shouldStop()) return false;
    cache.set(key, itemTerms(item));
  }
  return true;
}

/**
 * Returns the keywords of every item, keyed by item ID. The channel is always the first keyword.
 * Pass the same `cache` between calls, so only new or changed items are tokenized again.
 */
export function buildKeywordIndex(items: readonly SavedItem[], cache: TermCache = new Map()): KeywordIndex {
  const perItem = items.map((item) => {
    const key = cacheKey(item);
    let terms = cache.get(key);
    if (!terms) {
      terms = itemTerms(item);
      cache.set(key, terms);
    }
    return terms;
  });

  // Drop cache entries of deleted or changed items.
  if (cache.size > items.length) {
    const live = new Set(items.map(cacheKey));
    for (const key of cache.keys()) if (!live.has(key)) cache.delete(key);
  }

  const documentFrequency = new Map<string, number>();
  for (const { terms } of perItem) {
    for (const [term] of terms) documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
  }

  const n = items.length;
  const index: KeywordIndex = new Map();
  items.forEach((item, i) => {
    const { terms, total } = perItem[i]!;
    const channel = item.meta?.channel?.trim();
    const channelWords = new Set(channel ? channel.toLowerCase().split(/\s+/) : []);
    // Smoothed IDF: stays positive with one item, and still favors terms that few items share.
    const scored = terms
      .filter(([term]) => !channelWords.has(term))
      .map(([term, count]) => ({
        term,
        score: (count / Math.max(1, total)) * Math.log(1 + n / documentFrequency.get(term)!),
      }))
      .sort((a, b) => b.score - a.score);

    const keywords: Keyword[] = [];
    if (channel) keywords.push({ key: channelKey(channel), kind: 'channel', label: channel });
    for (const { term } of scored) {
      if (keywords.length >= KEYWORDS_PER_ITEM) break;
      keywords.push({ key: topicKey(term), kind: 'topic', label: term });
    }
    index.set(item.id, keywords);
  });
  return index;
}

export interface KeywordCount {
  keyword: Keyword;
  count: number;
}

/** Counts how many of `items` have each keyword. Sorted by count, then label. */
export function countKeywords(items: readonly SavedItem[], index: KeywordIndex, kind?: KeywordKind): KeywordCount[] {
  const counts = new Map<string, KeywordCount>();
  for (const item of items) {
    for (const keyword of index.get(item.id) ?? []) {
      if (kind && keyword.kind !== kind) continue;
      const entry = counts.get(keyword.key);
      if (entry) entry.count++;
      else counts.set(keyword.key, { keyword, count: 1 });
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.keyword.label.localeCompare(b.keyword.label));
}

export const keywordKind = (key: string): KeywordKind => (key.startsWith('channel:') ? 'channel' : 'topic');

/**
 * Returns the items that match the keyword keys. An item matches when it is from **any** of the
 * selected channels and has **all** of the selected topics.
 */
export function filterByKeywords(
  items: readonly SavedItem[],
  index: KeywordIndex,
  keys: ReadonlySet<string>,
): SavedItem[] {
  if (keys.size === 0) return [...items];
  let channels = 0;
  for (const key of keys) if (keywordKind(key) === 'channel') channels++;
  const topics = keys.size - channels;
  return items.filter((item) => {
    const own = index.get(item.id);
    if (!own) return false;
    let channelFound = false;
    let topicsFound = 0;
    for (const keyword of own) {
      if (!keys.has(keyword.key)) continue;
      if (keyword.kind === 'channel') channelFound = true;
      else topicsFound++;
    }
    return (channels === 0 || channelFound) && topicsFound === topics;
  });
}

/** Orders an item's keywords for display: channel first, then active filters, then the rest by rank. */
export function displayKeywords(keywords: readonly Keyword[], active: ReadonlySet<string>, limit: number): Keyword[] {
  if (active.size === 0) return keywords.slice(0, limit);
  const channel = keywords.filter((k) => k.kind === 'channel');
  const topics = keywords.filter((k) => k.kind === 'topic');
  const ordered = [...channel, ...topics.filter((k) => active.has(k.key)), ...topics.filter((k) => !active.has(k.key))];
  return ordered.slice(0, limit);
}
