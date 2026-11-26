// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  buildSearchUrl,
  cleanResultUrl,
  isExcludedUrl,
  mergeHits,
  parseGoogleResults,
  searchGoogle,
  SearchError,
  type SearchHit,
} from '../googleSearch';

const fixture = readFileSync(resolve(import.meta.dirname, 'fixtures/google-serp.html'), 'utf8');

const page = (results: string) => `<html><body><div id="search"><div id="rso">${results}</div></div></body></html>`;
const result = (href: string, title: string, snippet = '') =>
  `<div class="MjjYud"><a href="${href}"><h3>${title}</h3></a><div class="VwiC3b">${snippet}</div></div>`;

describe('parseGoogleResults', () => {
  it('parseGoogleResults extracts 10 links from the fixture', () => {
    const hits = parseGoogleResults(fixture);
    expect(hits).toHaveLength(10);
    expect(hits.map((hit) => hit.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(hits[0]).toEqual({
      url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC10204456',
      title: 'The Devastating Effects of Sleep Deprivation on Memory - PMC',
      snippet:
        'Numerous studies have examined the effects of SD on memory, with the majority showing that sleep disorders negatively affect memory.',
      rank: 1,
    });
    expect(hits[1]!.title).toBe("Not getting enough sleep? Here's how it's affecting your ...");
  });

  it('drops the date prefix and the "Read more" link from snippets', () => {
    const snippets = parseGoogleResults(fixture).map((hit) => hit.snippet ?? '');
    expect(snippets.every((snippet) => snippet.length > 20)).toBe(true);
    expect(snippets.some((snippet) => /Read more|days ago|Cited by/.test(snippet))).toBe(false);
  });

  it('unwraps /url?q= links, removes tracking parameters, and skips Google links and duplicates', () => {
    const hits = parseGoogleResults(
      page(
        result('/url?q=https://a.example/post/%3Futm_source%3Dx&sa=U', 'A') +
          result('https://b.example/x?srsltid=abc&id=7#top', 'B') +
          result('https://www.google.com/search?q=more', 'More results') +
          result('https://a.example/post', 'A again'),
      ),
    );
    expect(hits.map(({ url, rank }) => ({ url, rank }))).toEqual([
      { url: 'https://a.example/post', rank: 1 },
      { url: 'https://b.example/x?id=7', rank: 2 },
    ]);
  });

  it('falls back to any http link with a heading when the page has no #search or #rso', () => {
    const html = `<body><a href="https://c.example/"><h3>C</h3></a><a href="/local"><h3>Local</h3></a></body>`;
    expect(parseGoogleResults(html).map((hit) => hit.url)).toEqual(['https://c.example']);
  });

  it('returns nothing for a page without results', () => {
    expect(parseGoogleResults('<html><body><p>Nothing</p></body></html>')).toEqual([]);
  });
});

describe('search URLs', () => {
  it('builds the URL of the Search rules', () => {
    const url = new URL(buildSearchUrl('sleep memory -site:youtube.com'));
    expect(url.origin + url.pathname).toBe('https://www.google.com/search');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      q: 'sleep memory -site:youtube.com',
      hl: 'en',
      udm: '14',
      pws: '0',
    });
  });

  it('cleans result URLs and rejects non-http links', () => {
    expect(cleanResultUrl('https://x.example/a/?utm_medium=y&utm_campaign=z#h')).toBe('https://x.example/a');
    expect(cleanResultUrl('javascript:alert(1)')).toBeUndefined();
    expect(cleanResultUrl('/url?q=mailto:a@b.c')).toBeUndefined();
  });

  it('excludes Google, YouTube and the given hosts with their subdomains', () => {
    expect(isExcludedUrl('https://www.google.de/maps')).toBe(true);
    expect(isExcludedUrl('https://m.youtube.com/watch')).toBe(true);
    expect(isExcludedUrl('https://youtu.be/x')).toBe(true);
    expect(isExcludedUrl('https://blog.example.com/a', ['www.example.com'])).toBe(true);
    expect(isExcludedUrl('https://notexample.com/a', ['example.com'])).toBe(false);
  });
});

describe('mergeHits', () => {
  const hit = (url: string, rank: number, extra: Partial<SearchHit> = {}): SearchHit => ({
    url,
    title: url,
    rank,
    ...extra,
  });

  it('mergeHits deduplicates by normalized URL and orders by query count', () => {
    const articles = mergeHits([
      { query: 'q1', hits: [hit('https://a.example/1', 1), hit('https://b.example/1', 2)] },
      { query: 'q2', hits: [hit('http://www.b.example/1/', 4, { snippet: 'B text' }), hit('https://c.example/', 1)] },
      { query: 'q3', hits: [hit('https://b.example/1', 3), hit('https://a.example/1', 5)] },
    ]);
    expect(articles.map((a) => a.url)).toEqual(['https://b.example/1', 'https://a.example/1', 'https://c.example/']);
    expect(articles[0]).toEqual({
      url: 'https://b.example/1',
      title: 'https://b.example/1',
      snippet: 'B text',
      queries: ['q1', 'q3', 'q2'],
      bestRank: 2,
    });
    expect(articles[1]!.queries).toEqual(['q1', 'q3']);
  });

  it('orders equal query counts by best rank, leaves out excluded hosts, and caps the list', () => {
    const many = Array.from({ length: 20 }, (_, i) => hit(`https://s${i}.example/`, i + 1));
    const articles = mergeHits(
      [{ query: 'q', hits: [hit('https://item.example/self', 1), hit('https://youtu.be/v', 2), ...many] }],
      { excludeHosts: ['item.example'], limit: 15 },
    );
    expect(articles).toHaveLength(15);
    expect(articles[0]!.url).toBe('https://s0.example/');
  });
});

describe('searchGoogle', () => {
  const respond = (body: string, init: { status?: number; url?: string } = {}) => {
    const response = new Response(body, { status: init.status ?? 200 });
    Object.defineProperty(response, 'url', { value: init.url ?? 'https://www.google.com/search?q=x' });
    return vi.fn(async () => response) as unknown as typeof fetch;
  };
  const codeOf = (promise: Promise<unknown>) =>
    promise.then(
      () => 'ok',
      (error: unknown) => (error instanceof SearchError ? error.code : 'other'),
    );

  it('fetches the result page with the cookies and parses it', async () => {
    const doFetch = respond(fixture);
    const hits = await searchGoogle('sleep', { fetch: doFetch });
    expect(hits).toHaveLength(10);
    expect(doFetch).toHaveBeenCalledWith(buildSearchUrl('sleep'), expect.objectContaining({ credentials: 'include' }));
  });

  it('keeps the results of a full page that mentions the JavaScript stub', async () => {
    const hits = await searchGoogle('x', { fetch: respond(`${fixture}<a href="/httpservice/retry/enablejs">x</a>`) });
    expect(hits).toHaveLength(10);
  });

  it('throws a blocking error for the abort conditions', async () => {
    const captcha = codeOf(searchGoogle('x', { fetch: respond('', { url: 'https://www.google.com/sorry/index?x' }) }));
    const consent = codeOf(searchGoogle('x', { fetch: respond('', { url: 'https://consent.google.com/ml?x' }) }));
    const limited = codeOf(searchGoogle('x', { fetch: respond('', { status: 429 }) }));
    const stub = codeOf(searchGoogle('x', { fetch: respond('<noscript><a href="/httpservice/retry/enablejs">') }));
    expect(await Promise.all([captcha, consent, limited, stub])).toEqual([
      'captcha',
      'consent',
      'rate-limited',
      'javascript-stub',
    ]);
    expect(new SearchError('captcha', '').blocking).toBe(true);
    expect(new SearchError('network', '').blocking).toBe(false);
  });

  it('returns an empty list for a page without results, and a non-blocking error for network failures', async () => {
    await expect(searchGoogle('x', { fetch: respond('<html><body>Nothing</body></html>') })).resolves.toEqual([]);
    const failing = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    await expect(codeOf(searchGoogle('x', { fetch: failing }))).resolves.toBe('network');
    await expect(codeOf(searchGoogle('x', { fetch: respond('', { status: 500 }) }))).resolves.toBe('http');
  });
});
