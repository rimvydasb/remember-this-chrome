import type { RelatedArticle } from './types';

/**
 * Google web search without an API key: an extension page fetches the result page with the user's
 * cookies and parses the HTML. See `docs/find-related-articles-story.md` (D1, Search rules).
 */

/** The host permission that lets the extension fetch Google result pages. */
export const GOOGLE_HOST_PERMISSION = 'https://www.google.com/*';

/** Time limit of one result page request. */
export const SEARCH_TIMEOUT_MS = 20_000;

/** Most articles kept per search. */
export const MAX_RELATED_ARTICLES = 15;

/** One result of one query. */
export interface SearchHit {
  url: string;
  title: string;
  snippet?: string;
  /** 1-based position on the result page. */
  rank: number;
}

/**
 * Why a search failed. The `blocking` codes mean that Google stopped trusting the requests (or
 * that its markup changed); the caller pauses all searches for a while.
 */
export type SearchErrorCode =
  'captcha' | 'consent' | 'rate-limited' | 'javascript-stub' | 'no-results' | 'http' | 'network' | 'no-articles';

const BLOCKING_CODES: ReadonlySet<SearchErrorCode> = new Set([
  'captcha',
  'consent',
  'rate-limited',
  'javascript-stub',
  'no-results',
]);

export class SearchError extends Error {
  constructor(
    readonly code: SearchErrorCode,
    message: string,
  ) {
    super(message);
  }

  /** True when the caller must pause searching (see the cooldown in the Search rules). */
  get blocking(): boolean {
    return BLOCKING_CODES.has(this.code);
  }
}

/** The result page URL of a query: English, "Web" filter (no AI overview), not personalized. */
export function buildSearchUrl(query: string): string {
  const params = new URLSearchParams({ q: query, hl: 'en', udm: '14', pws: '0' });
  return `https://www.google.com/search?${params}`;
}

/** Query parameters that only track the click. */
const TRACKING_PARAM = /^(utm_.*|srsltid)$/i;

/**
 * Cleans a result link: unwraps Google's `/url?q=` redirect, drops tracking parameters, the
 * fragment and a trailing slash. Returns undefined for links that are not http(s).
 */
export function cleanResultUrl(href: string, base = 'https://www.google.com/'): string | undefined {
  let url: URL;
  try {
    url = new URL(href, base);
  } catch {
    return undefined;
  }
  if (isGoogleHost(url.hostname) && url.pathname === '/url') {
    const target = url.searchParams.get('q') ?? url.searchParams.get('url');
    return target && target !== href ? cleanResultUrl(target, base) : undefined;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
  // Collect first: deleting while iterating the live `keys()` iterator would skip entries.
  const tracking = Array.from(url.searchParams.keys()).filter((key) => TRACKING_PARAM.test(key));
  for (const key of tracking) url.searchParams.delete(key);
  url.hash = '';
  return url.toString().replace(/\/+$/, '');
}

/** The key that tells two result URLs apart: protocol, `www.` and case of the host do not count. */
export function urlKey(url: string): string {
  const parsed = new URL(url);
  return `${bareHost(parsed.hostname)}${parsed.pathname.replace(/\/+$/, '')}${parsed.search}`;
}

/** A host name without `www.`, in lowercase. */
export function bareHost(host: string): string {
  return host.toLowerCase().replace(/^www\./, '');
}

function isGoogleHost(host: string): boolean {
  return /(^|\.)google\.[a-z.]+$/i.test(host);
}

/** Hosts that never count as related articles: Google itself and the video sites. */
const ALWAYS_EXCLUDED = ['youtube.com', 'youtu.be'];

/** True when the URL is on Google, on YouTube, or on one of `extraHosts` (or a subdomain of them). */
export function isExcludedUrl(url: string, extraHosts: readonly string[] = []): boolean {
  const host = bareHost(new URL(url).hostname);
  if (isGoogleHost(host)) return true;
  return [...ALWAYS_EXCLUDED, ...extraHosts.map(bareHost)].some(
    (excluded) => host === excluded || host.endsWith(`.${excluded}`),
  );
}

const normalizeText = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();

/** The description of a result: the snippet text without the date prefix and the "Read more" link. */
function snippetOf(anchor: Element): string | undefined {
  const container = anchor.closest('.MjjYud, .g, [data-hveid]');
  const element = container?.querySelector('.VwiC3b, [data-sncf]');
  if (!element) return undefined;
  const copy = element.cloneNode(true) as Element;
  copy.querySelectorAll('.YrbPuc, a').forEach((node) => node.remove());
  return normalizeText(copy.textContent) || undefined;
}

/** The result links of a page: anchors with an `h3` inside `#search` or `#rso`, else anywhere. */
function resultAnchors(doc: Document): Element[] {
  const withHeading = (root: ParentNode) =>
    [...root.querySelectorAll('a[href]')].filter((anchor) => anchor.querySelector('h3'));
  const root = doc.querySelector('#search') ?? doc.querySelector('#rso');
  const inResults = root ? withHeading(root) : [];
  if (inResults.length > 0) return inResults;
  return withHeading(doc).filter((anchor) => /^https?:/i.test(anchor.getAttribute('href') ?? ''));
}

/** Parses a Google result page. Pure: HTML in, organic results out, in page order. */
export function parseGoogleResults(html: string): SearchHit[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const hits: SearchHit[] = [];
  const seen = new Set<string>();
  for (const anchor of resultAnchors(doc)) {
    const url = cleanResultUrl(anchor.getAttribute('href') ?? '');
    if (!url || isGoogleHost(new URL(url).hostname)) continue;
    const key = urlKey(url);
    const title = normalizeText(anchor.querySelector('h3')?.textContent);
    if (!title || seen.has(key)) continue;
    seen.add(key);
    const hit: SearchHit = { url, title, rank: hits.length + 1 };
    const snippet = snippetOf(anchor);
    if (snippet) hit.snippet = snippet;
    hits.push(hit);
  }
  return hits;
}

/** Marks of the page that Google sends to clients that do not run JavaScript. */
const JAVASCRIPT_STUB = /\/httpservice\/retry\/enablejs/;
/** Marks of the bot check page. */
const CAPTCHA_PAGE = /\/sorry\/|unusual traffic from your computer/i;

export interface SearchOptions {
  fetch?: typeof fetch;
  timeoutMs?: number;
}

/**
 * Runs one query on Google with the user's cookies and returns the organic results. Throws a
 * `SearchError` for the abort conditions of the Search rules: the bot check (`/sorry/`), the
 * consent page, HTTP 429, and the JavaScript stub. An empty list means a page without results.
 */
export async function searchGoogle(query: string, options: SearchOptions = {}): Promise<SearchHit[]> {
  const doFetch = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? SEARCH_TIMEOUT_MS;
  let response: Response;
  try {
    response = await doFetch(buildSearchUrl(query), {
      credentials: 'include',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      throw new SearchError('network', `Google did not answer within ${Math.round(timeoutMs / 1000)} seconds.`);
    }
    throw new SearchError('network', 'Cannot reach Google. Check the internet connection.');
  }

  const finalUrl = response.url || '';
  if (/^https?:\/\/[^/]*google\.[^/]+\/sorry\//i.test(finalUrl)) {
    throw new SearchError('captcha', 'Google asks to prove that you are not a robot (bot check).');
  }
  if (/^https?:\/\/consent\.google\./i.test(finalUrl)) {
    throw new SearchError('consent', 'Google shows its cookie consent page. Open google.com once and answer it.');
  }
  if (response.status === 429) {
    throw new SearchError('rate-limited', 'Google refuses more searches for now (HTTP 429).');
  }
  if (!response.ok) throw new SearchError('http', `Google returned HTTP ${response.status}.`);

  const html = await response.text().catch(() => '');
  const hits = parseGoogleResults(html);
  if (hits.length > 0) return hits;
  // A full result page also contains the stub address, so only an empty page counts as the stub.
  if (CAPTCHA_PAGE.test(html) && !html.includes('id="rso"')) {
    throw new SearchError('captcha', 'Google asks to prove that you are not a robot (bot check).');
  }
  if (JAVASCRIPT_STUB.test(html)) {
    throw new SearchError('javascript-stub', 'Google sent a page that needs JavaScript instead of the results.');
  }
  return [];
}

/** The results of one query. */
export interface QueryHits {
  query: string;
  hits: readonly SearchHit[];
}

export interface MergeOptions {
  /** Hosts to leave out, for example the host of the item itself. Google and YouTube always are. */
  excludeHosts?: readonly string[];
  limit?: number;
}

/**
 * Merges the results of several queries: one article per normalized URL, found by most queries
 * first, then by best rank, then in the order found. Keeps at most `limit` articles.
 */
export function mergeHits(results: readonly QueryHits[], options: MergeOptions = {}): RelatedArticle[] {
  const byKey = new Map<string, RelatedArticle & { ranks: Map<string, number>; order: number }>();
  for (const { query, hits } of results) {
    for (const hit of hits) {
      if (isExcludedUrl(hit.url, options.excludeHosts)) continue;
      const key = urlKey(hit.url);
      let entry = byKey.get(key);
      if (!entry) {
        entry = {
          url: hit.url,
          title: hit.title,
          queries: [],
          bestRank: hit.rank,
          ranks: new Map(),
          order: byKey.size,
        };
        if (hit.snippet) entry.snippet = hit.snippet;
        byKey.set(key, entry);
      }
      if (!entry.snippet && hit.snippet) entry.snippet = hit.snippet;
      const previous = entry.ranks.get(query);
      if (previous === undefined || hit.rank < previous) entry.ranks.set(query, hit.rank);
      entry.bestRank = Math.min(entry.bestRank, hit.rank);
    }
  }
  return [...byKey.values()]
    .sort((a, b) => b.ranks.size - a.ranks.size || a.bestRank - b.bestRank || a.order - b.order)
    .slice(0, options.limit ?? MAX_RELATED_ARTICLES)
    .map(({ ranks, order: _order, ...article }) => ({
      ...article,
      queries: [...ranks].sort((a, b) => a[1] - b[1]).map(([query]) => query),
    }));
}
