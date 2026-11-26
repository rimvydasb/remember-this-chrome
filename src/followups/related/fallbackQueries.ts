import type { PromptItem } from '../../shared/promptModel';
import { tagLabels } from '../../shared/tags';
import { itemTerms } from '../../shared/terms';

/** Text read for keyword tags when the item has no AI tags. Bounded, because extraction is slow. */
const MAX_TERM_TEXT = 4_000;
const MAX_TITLE_WORDS = 10;
const TAGS_PER_QUERY = 4;

/** The title without the decorations that sites and channels add ("| Site", "(Official video)", emoji). */
function cleanTitle(title: string): string {
  return title
    .replace(/\s+[|–—]\s+[^|–—]*$/u, '')
    .replace(/[([][^)\]]*(?:video|official|full|podcast|ep\.?\s*\d+)[^)\]]*[)\]]/giu, '')
    .replace(/[^\p{L}\p{N}\s'’.,:&+-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .slice(0, MAX_TITLE_WORDS)
    .join(' ');
}

/**
 * Two search queries made without an LLM: the cleaned title, and the top tags (AI tags, else
 * keyword tags of the title and the start of the text). Used when no LLM is reachable.
 */
export function buildFallbackQueries(item: PromptItem): string[] {
  const title = cleanTitle(item.title);
  let tags = tagLabels(item, 'topic');
  if (tags.length === 0) {
    const { terms } = itemTerms({ title: item.title, content: item.content.slice(0, MAX_TERM_TEXT), meta: item.meta });
    tags = terms.map(([term]) => term);
  }
  const channel = item.meta?.channel?.toLowerCase();
  const tagQuery = tags
    .filter((tag) => tag.toLowerCase() !== channel)
    .slice(0, TAGS_PER_QUERY)
    .join(' ');
  const queries = [title, tagQuery].filter((query) => query.length >= 3);
  return [...new Set(queries)];
}
