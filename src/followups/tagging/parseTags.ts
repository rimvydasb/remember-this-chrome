/** Most tags kept from an answer. */
export const MAX_AI_TAGS = 10;

/**
 * Reads tags from a model answer: a JSON array (also inside a code fence or after other text),
 * else one tag per line or comma. Strips list markers and "#", drops duplicates and odd lengths.
 */
export function parseTags(answer: string): string[] {
  let raw: string[] | undefined;
  const array = answer.match(/\[[\s\S]*\]/);
  if (array) {
    try {
      const parsed: unknown = JSON.parse(array[0]);
      if (Array.isArray(parsed)) raw = parsed.filter((tag): tag is string => typeof tag === 'string');
    } catch {
      // Not valid JSON: fall back to lines and commas.
    }
  }
  raw ??= answer.replace(/```\w*/g, '').split(/[\n,]/);

  const tags: string[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    const tag = entry
      .replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '')
      .replace(/^[\s"'#`]+|[\s"'`.]+$/g, '')
      .replace(/\s+/g, ' ');
    const key = tag.toLowerCase();
    if (tag.length < 2 || tag.length > 40 || tag.split(' ').length > 4 || seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
    if (tags.length >= MAX_AI_TAGS) break;
  }
  return tags;
}
