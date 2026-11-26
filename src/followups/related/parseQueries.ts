import { MAX_QUERIES } from './prompt';

/** Google ignores words after the 32nd; queries this long are not search queries. */
const MAX_QUERY_WORDS = 20;

/**
 * Reads search queries from a model answer: a JSON array (also inside a code fence or after other
 * text), else one query per line. Strips list markers and quotes, drops duplicates (ignoring case),
 * empty queries and queries over 20 words. Keeps at most 5.
 */
export function parseQueries(answer: string): string[] {
  let raw: string[] | undefined;
  const array = answer.match(/\[[\s\S]*\]/);
  if (array) {
    try {
      const parsed: unknown = JSON.parse(array[0]);
      if (Array.isArray(parsed)) raw = parsed.filter((entry): entry is string => typeof entry === 'string');
    } catch {
      // Not valid JSON: fall back to lines.
    }
  }
  raw ??= answer.replace(/```\w*/g, '').split('\n');

  const queries: string[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    const query = entry
      .replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '')
      .replace(/^[\s"'`]+|[\s"'`,]+$/g, '')
      .replace(/\s+/g, ' ');
    const key = query.toLowerCase();
    const words = query.split(' ').length;
    if (query.length < 3 || words > MAX_QUERY_WORDS || seen.has(key)) continue;
    seen.add(key);
    queries.push(query);
    if (queries.length >= MAX_QUERIES) break;
  }
  return queries;
}
