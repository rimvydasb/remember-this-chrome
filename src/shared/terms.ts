import nlp from 'compromise/two';
import { extract, getStopwords, supported_language_codes } from 'keyword-extractor';
import type { SavedItem } from './types';

/**
 * Term extraction for keywords. Slow on long transcripts (English part-of-speech tagging), so the
 * dashboard runs it in a worker (`dashboard/termWorker.ts`).
 *
 * English text is tagged in context with `compromise`: only nouns, proper nouns and acronyms count,
 * so "we code in Rust" adds nothing but "the code is slow" adds "code". Plurals count as their singular
 * ("agents" → "agent"). Other languages have no tagger: their words are only filtered by stopwords.
 *
 * Acronyms ("AI", "LLMs") count even when they have only two letters, and keep their capitals.
 * Terms in the title and in the first paragraph of the description get extra weight.
 */

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
  'year',
  'years',
  'people',
  'person',
];

/** Nouns that say nothing about a topic on their own ("on the other side", "a bunch of"). */
const GENERIC_NOUNS = [
  'side',
  'sides',
  'end',
  'bunch',
  'reason',
  'part',
  'point',
  'case',
  'fact',
  'example',
  'number',
  'piece',
  'level',
  'deal',
  'sense',
  'matter',
  'question',
  'answer',
  'problem',
  'idea',
  'place',
  'set',
  'hand',
  'half',
  'top',
  'bottom',
  'front',
  'rest',
  'whole',
  'world',
  'life',
  'week',
  'month',
  'minute',
  'hour',
  'second',
  'moment',
  'today',
  'tomorrow',
  'yesterday',
  'everyone',
  'anybody',
  'nobody',
  'work',
  'change',
  'love',
  'fun',
];

/** A language code that keyword-extractor has stopwords for. */
export type LanguageCode = NonNullable<NonNullable<Parameters<typeof getStopwords>[0]>['language']>;

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
    if (language === 'en') for (const word of GENERIC_NOUNS) set.add(word);
    stopwordCache.set(language, set);
  }
  return set;
}

/** Strips leftover punctuation at the edges of a token (brackets, dashes, quotes). */
const EDGE_PUNCTUATION = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;
const HAS_LETTER = /\p{L}/u;
const HAS_DIGIT = /\p{N}/u;
/** An acronym as written in the source: "AI", "API", "LLMs". */
const ACRONYM = /^[A-Z]{2,5}s?$/;

export interface TermCounts {
  /** Lowercase term to number of occurrences. */
  counts: Map<string, number>;
  /** Terms that the source writes as acronyms most of the time. Shown in capitals. */
  acronyms: Set<string>;
}

class Counter {
  readonly counts = new Map<string, number>();
  private readonly acronymHits = new Map<string, number>();

  private readonly stopwords: Set<string>;

  constructor(stopwords: Set<string>) {
    this.stopwords = stopwords;
  }

  /** Counts a cleaned token. `word` is lowercase; `acronym` tells that the source wrote it in capitals. */
  add(word: string, acronym: boolean): void {
    // Possessives: "einstein's" counts as "einstein".
    const term = word.endsWith("'s") || word.endsWith('’s') ? word.slice(0, -2) : word;
    const minLength = acronym ? 2 : 3;
    if (term.length < minLength || term.length > 40 || !HAS_LETTER.test(term) || HAS_DIGIT.test(term)) return;
    if (this.stopwords.has(term)) return;
    this.counts.set(term, (this.counts.get(term) ?? 0) + 1);
    if (acronym) this.acronymHits.set(term, (this.acronymHits.get(term) ?? 0) + 1);
  }

  result(): TermCounts {
    const acronyms = new Set<string>();
    for (const [term, hits] of this.acronymHits) if (hits * 2 > this.counts.get(term)!) acronyms.add(term);
    return { counts: this.counts, acronyms };
  }
}

/** Lowercase key of an acronym token: "LLMs" → "llm". */
const acronymKey = (text: string) => (text.endsWith('s') ? text.slice(0, -1) : text).toLowerCase();

interface TaggedTerm {
  text: string;
  normal: string;
  tags: Set<string>;
}

const { methods, model } = nlp.world() as unknown as {
  methods: { two: { transform: { noun: { toSingular: (word: string, model: unknown) => string } } } };
  model: unknown;
};
const singularCache = new Map<string, string>();

function singular(word: string): string {
  let result = singularCache.get(word);
  if (result === undefined) {
    result = methods.two.transform.noun.toSingular(word, model) || word;
    if (singularCache.size > 50_000) singularCache.clear();
    singularCache.set(word, result);
  }
  return result;
}

/** Tags that mark a noun as a non-topic: "we", "Monday", "five". */
const EXCLUDED_TAGS = ['Pronoun', 'Date', 'Value'];

function countEnglish(text: string, counter: Counter): void {
  const docs = (nlp(text) as unknown as { docs: TaggedTerm[][] }).docs;
  for (const sentence of docs) {
    for (const term of sentence) {
      const text = term.text.replace(EDGE_PUNCTUATION, '');
      if (!text) continue;
      if (ACRONYM.test(text)) {
        counter.add(acronymKey(text), true);
        continue;
      }
      const { tags } = term;
      if (!tags.has('Noun') || EXCLUDED_TAGS.some((tag) => tags.has(tag))) continue;
      const word = term.normal.replace(EDGE_PUNCTUATION, '');
      counter.add(tags.has('Plural') ? singular(word) : word, false);
    }
  }
}

function countOther(text: string, language: LanguageCode, counter: Counter): void {
  // An empty stopword list makes keyword-extractor tokenize only; the counter filters stopwords.
  const tokens = extract(text, { language, remove_digits: true, return_changed_case: false, stopwords: [] });
  for (const raw of tokens) {
    const text = raw.replace(EDGE_PUNCTUATION, '');
    if (ACRONYM.test(text)) counter.add(acronymKey(text), true);
    else counter.add(text.toLowerCase(), false);
  }
}

/** Counts the topic terms of a text. */
export function termFrequencies(text: string, language: LanguageCode = 'en'): TermCounts {
  const counter = new Counter(stopwordsFor(language));
  if (language === 'en') countEnglish(text, counter);
  else countOther(text, language, counter);
  return counter.result();
}

export interface ItemTerms {
  /** Terms with their weight (count × boost), heaviest first, at most `MAX_TERMS_PER_ITEM`. */
  terms: [string, number][];
  /** Number of counted terms in the item. */
  total: number;
  /** Terms to show in capitals. */
  acronyms: string[];
}

/** Only the heaviest terms of an item are candidates. Keeps memory and the IDF pass small. */
const MAX_TERMS_PER_ITEM = 60;

/** Weight multiplier of terms that the title contains. */
export const TITLE_BOOST = 3;
/** Weight multiplier of terms that the description summary contains. */
export const DESCRIPTION_BOOST = 2;

/**
 * The words of a short text, with their singular forms. Short texts such as titles are too short to
 * tag reliably ("Garden basics" reads as an order to garden), so they are matched by word.
 */
function wordsOf(text: string): Set<string> {
  const words = new Set<string>();
  for (const match of text.toLowerCase().matchAll(/[\p{L}\p{N}'’]+/gu)) {
    const word = match[0].replace(/['’]s$/, '');
    words.add(word);
    words.add(singular(word));
  }
  return words;
}

const URL_PATTERN = /https?:\/\/|www\.|\.\w{2,}\//i;

/**
 * The author's summary of the item: the first paragraph of the description, unless it holds a link.
 * Later paragraphs are usually sponsor reads and social links ("Check out my Twitch").
 */
export function descriptionSummary(description: string | undefined): string {
  const first =
    description
      ?.trim()
      .split(/\n\s*\n/)[0]
      ?.trim() ?? '';
  return URL_PATTERN.test(first) ? '' : first;
}

/** Extracts the weighted candidate terms of an item. */
export function itemTerms(item: Pick<SavedItem, 'title' | 'content' | 'meta'>): ItemTerms {
  const language = languageCode(item.meta?.language);
  const { counts, acronyms } = termFrequencies(`${item.title}.\n${item.content}`, language);
  const title = wordsOf(item.title);
  const described = wordsOf(descriptionSummary(item.meta?.description));

  let total = 0;
  const weighted: [string, number][] = [];
  for (const [term, count] of counts) {
    total += count;
    const boost = title.has(term) ? TITLE_BOOST : described.has(term) ? DESCRIPTION_BOOST : 1;
    weighted.push([term, count * boost]);
  }
  const terms = weighted.sort((a, b) => b[1] - a[1]).slice(0, MAX_TERMS_PER_ITEM);
  return { terms, total, acronyms: terms.map(([term]) => term).filter((term) => acronyms.has(term)) };
}
