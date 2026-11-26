import { LlmError } from '../../llm';
import { createFollowUp, followUpsOfType } from '../../shared/followUpRecords';
import {
  bareHost,
  mergeHits,
  searchGoogle,
  SearchError,
  type QueryHits,
  type SearchHit,
} from '../../shared/googleSearch';
import type { FollowUp, RelatedArticle, SavedItem } from '../../shared/types';
import { ItemDeletedError } from '../errors';
import type { FollowUpPipeline, PipelineContext } from '../pipeline';
import type { ItemStore } from '../ports';
import { buildFallbackQueries } from './fallbackQueries';
import { generateSearchQueries } from './generateSearchQueries';

/** Pause between two Google requests: 1.5 to 3 seconds (Search rules). */
export const MIN_SEARCH_SPACING_MS = 1_500;
export const MAX_SEARCH_SPACING_MS = 3_000;

/** What the pipeline is doing, for the progress text. */
export type RelatedProgress = { step: 'queries' } | { step: 'search'; index: number; total: number };

export interface RelatedInput {
  onProgress?: (progress: RelatedProgress) => void;
}

export interface RelatedResult {
  followUp: FollowUp;
  /** Set when Google stopped the search after some queries; the follow-up has the results found before. */
  aborted?: SearchError;
}

/** The search found nothing to save. `queries` are the queries that were written, so the user sees what ran. */
export class RelatedSearchError extends Error {
  constructor(
    readonly searchError: SearchError,
    readonly queries: readonly string[],
  ) {
    super(searchError.message);
  }

  get blocking(): boolean {
    return this.searchError.blocking;
  }
}

export interface RelatedDeps {
  store: Pick<ItemStore, 'addFollowUp' | 'deleteFollowUp'>;
  generate?: typeof generateSearchQueries;
  search?: (query: string) => Promise<SearchHit[]>;
  /** Waits between requests. Tests pass an instant one. */
  wait?: (ms: number) => Promise<void>;
  random?: () => number;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** The host of the item URL, or undefined for an invalid URL. */
function hostOf(url: string): string | undefined {
  try {
    return bareHost(new URL(url).hostname) || undefined;
  } catch {
    return undefined;
  }
}

/** Escapes the characters that end a Markdown link text. */
const linkText = (text: string) => text.replace(/([\\[\]])/g, '\\$1');

/** The articles as a Markdown list, kept in `generatedContent` for the Markdown export. */
export function articlesToMarkdown(articles: readonly RelatedArticle[]): string {
  return articles
    .map((article) => {
      const snippet = article.snippet ? ` — ${article.snippet.replace(/\s+/g, ' ')}` : '';
      return `- [${linkText(article.title)}](<${article.url}>)${snippet}`;
    })
    .join('\n');
}

/**
 * The related-articles follow-up: the LLM writes search queries (or the title and tags do, when no
 * LLM is reachable), Google runs them one at a time, and the merged links are saved as a
 * `related-articles` follow-up. Each run adds a follow-up and keeps the earlier ones.
 */
export class RelatedArticlesPipeline implements FollowUpPipeline<RelatedInput, RelatedResult> {
  readonly id = 'related-articles';
  private readonly generate: typeof generateSearchQueries;
  private readonly search: (query: string) => Promise<SearchHit[]>;
  private readonly wait: (ms: number) => Promise<void>;
  private readonly random: () => number;

  constructor(private readonly deps: RelatedDeps) {
    this.generate = deps.generate ?? generateSearchQueries;
    this.search = deps.search ?? ((query) => searchGoogle(query));
    this.wait = deps.wait ?? sleep;
    this.random = deps.random ?? Math.random;
  }

  /** The related-articles follow-ups of the item, newest first. */
  list(item: SavedItem): FollowUp[] {
    return followUpsOfType(item, 'related-articles').reverse();
  }

  /** The queries for the item, from the LLM or, when no LLM is reachable, from the title and tags. */
  private async queriesFor(context: PipelineContext): Promise<{ queries: string[]; model?: string }> {
    try {
      return await this.generate(context.settings, context.item);
    } catch (error) {
      if (!(error instanceof LlmError)) throw error;
      return { queries: buildFallbackQueries(context.item) };
    }
  }

  /**
   * Writes the queries, runs them, and saves the found articles. Throws `RelatedSearchError` when
   * nothing was found, and `ItemDeletedError` when the item is gone.
   */
  async run(context: PipelineContext, input: RelatedInput = {}): Promise<RelatedResult> {
    const { item } = context;
    input.onProgress?.({ step: 'queries' });
    const generated = await this.queriesFor(context);
    // Added in code, not in the prompt, so a model cannot forget it (D3).
    const queries = generated.queries.map((query) =>
      item.type === 'youtube_transcript' && !/-site:youtube\.com/i.test(query) ? `${query} -site:youtube.com` : query,
    );
    if (queries.length === 0) {
      throw new RelatedSearchError(new SearchError('no-articles', 'There is nothing to search for.'), []);
    }

    const results: QueryHits[] = [];
    let aborted: SearchError | undefined;
    for (const [index, query] of queries.entries()) {
      if (index > 0) {
        await this.wait(MIN_SEARCH_SPACING_MS + this.random() * (MAX_SEARCH_SPACING_MS - MIN_SEARCH_SPACING_MS));
      }
      input.onProgress?.({ step: 'search', index: index + 1, total: queries.length });
      try {
        results.push({ query, hits: await this.search(query) });
      } catch (error) {
        if (!(error instanceof SearchError)) throw error;
        aborted = error;
        break;
      }
    }

    const found = results.some((result) => result.hits.length > 0);
    if (!found && !aborted) {
      aborted = new SearchError(
        'no-results',
        'Google returned no results for any query. Its page markup may have changed.',
      );
    }
    const itemHost = hostOf(item.url);
    const articles = mergeHits(results, { excludeHosts: itemHost ? [itemHost] : [] });
    if (articles.length === 0) {
      throw new RelatedSearchError(
        aborted ?? new SearchError('no-articles', 'The search found only the source itself and videos.'),
        queries,
      );
    }

    const followUp = createFollowUp('related-articles', {
      generatedContent: articlesToMarkdown(articles),
      articles,
      queries: results.map((result) => result.query),
    });
    if (generated.model) followUp.model = generated.model;
    if (!(await this.deps.store.addFollowUp(item.id, followUp))) throw new ItemDeletedError();
    return aborted ? { followUp, aborted } : { followUp };
  }

  remove(item: SavedItem, followUp: FollowUp): Promise<void> {
    return this.deps.store.deleteFollowUp(item.id, followUp.id);
  }
}
