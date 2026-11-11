import type { SavedItem } from './types';
import { countWords } from './transcript';

export const TYPE_LABELS: Record<SavedItem['type'], string> = {
  youtube_transcript: 'YouTube transcript',
  webpage_text: 'Web page',
};

function escapeInline(text: string): string {
  return text
    .replace(/([\\`*_[\]<>#|])/g, '\\$1')
    .replace(/\s+/g, ' ')
    .trim();
}

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/** Renders one item as Markdown. `headingLevel` sets the title heading (1 = `#`). */
export function itemToMarkdown(item: SavedItem, headingLevel = 1): string {
  const hashes = '#'.repeat(Math.min(Math.max(headingLevel, 1), 6));
  const lines = [`${hashes} ${escapeInline(item.title) || 'Untitled'}`, ''];
  lines.push(`- **Source:** <${item.url}>`);
  if (item.meta?.channel) lines.push(`- **Channel:** ${escapeInline(item.meta.channel)}`);
  if (item.meta?.durationSec) lines.push(`- **Duration:** ${formatDuration(item.meta.durationSec)}`);
  if (item.meta?.language) lines.push(`- **Language:** ${escapeInline(item.meta.language)}`);
  lines.push(`- **Type:** ${TYPE_LABELS[item.type]}`);
  lines.push(`- **Saved:** ${item.timestamp}`);
  lines.push(`- **Words:** ${countWords(item.content)}`);
  lines.push('', item.content.trim(), '');
  return lines.join('\n');
}

/** Renders one item as a standalone document, or several items as one combined document. */
export function itemsToMarkdown(items: readonly SavedItem[], now = new Date()): string {
  if (items.length === 1) return itemToMarkdown(items[0]!);
  const header = [
    '# Remember This — export',
    '',
    `Exported ${now.toISOString()} · ${items.length} items`,
    '',
    ...items.map((item, i) => `${i + 1}. ${escapeInline(item.title) || 'Untitled'}`),
    '',
  ].join('\n');
  return [header, ...items.map((item) => itemToMarkdown(item, 2))].join('\n---\n\n');
}

export function slugify(text: string, fallback = 'transcript'): string {
  const slug = text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
  return slug || fallback;
}

export function markdownFileName(items: readonly SavedItem[], now = new Date()): string {
  if (items.length === 1) return `${slugify(items[0]!.title)}.md`;
  return `remember-this-${now.toISOString().slice(0, 10)}-${items.length}-items.md`;
}
