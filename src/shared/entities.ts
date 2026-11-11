const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  laquo: '«',
  raquo: '»',
  bull: '•',
  middot: '·',
  copy: '©',
  reg: '®',
  trade: '™',
  deg: '°',
  euro: '€',
  pound: '£',
  cent: '¢',
  yen: '¥',
  times: '×',
  divide: '÷',
  shy: '',
  zwj: '',
  zwnj: '',
};

const ENTITY_PATTERN = /&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi;

function decodeOnce(input: string): string {
  return input.replace(ENTITY_PATTERN, (match, body: string) => {
    if (body[0] === '#') {
      const isHex = body[1] === 'x' || body[1] === 'X';
      const codePoint = Number.parseInt(body.slice(isHex ? 2 : 1), isHex ? 16 : 10);
      if (!Number.isFinite(codePoint) || codePoint < 0 || codePoint > 0x10ffff) return match;
      return String.fromCodePoint(codePoint);
    }
    const named = NAMED_ENTITIES[body.toLowerCase()];
    return named ?? match;
  });
}

/**
 * Decodes HTML entities (for example `&#39;` to `'`). Works without a DOM, so it runs in the
 * service worker. Caption feeds are sometimes double-encoded (`&amp;#39;`), so it decodes up to
 * `maxPasses` times while entities remain.
 */
export function decodeHtmlEntities(input: string, maxPasses = 2): string {
  let result = input;
  for (let pass = 0; pass < maxPasses; pass++) {
    const next = decodeOnce(result);
    if (next === result) break;
    result = next;
  }
  return result;
}
