import type { SavedItem, Tag } from '../src/shared/types';

const at = '2026-01-01T00:00:00.000Z';
const tag = (kind: Tag['kind'], label: string): Tag => ({
  label,
  kind,
  source: kind === 'topic' ? 'ai-topics' : 'ai-sentiment',
  createdAt: at,
});

/** Fake library. Tagged on purpose, so the background tagger has nothing to ask the LLM. */
export const ITEMS: SavedItem[] = [
  {
    id: 'yt-sourdough',
    title: 'Sourdough bread for beginners',
    url: 'https://www.youtube.com/watch?v=aaaaaaaaaaa',
    type: 'youtube_transcript',
    content: 'Today we bake sourdough. Keep the starter warm and fold the dough every thirty minutes.',
    timestamp: '2026-03-03T10:00:00.000Z',
    meta: { channel: 'Baker Bob', videoId: 'aaaaaaaaaaa', durationSec: 600 },
    tags: [tag('topic', 'sourdough'), tag('topic', 'baking')],
  },
  {
    id: 'yt-rust',
    title: 'Rust ownership explained',
    url: 'https://www.youtube.com/watch?v=bbbbbbbbbbb',
    type: 'youtube_transcript',
    content: 'Ownership in Rust means every value has one owner. Borrowing lets you reference without moving.',
    timestamp: '2026-03-02T10:00:00.000Z',
    meta: { channel: 'Code Corner', videoId: 'bbbbbbbbbbb', durationSec: 900 },
    tags: [tag('topic', 'rust'), tag('topic', 'programming')],
  },
  {
    id: 'yt-borrow',
    title: 'Lifetimes in Rust',
    url: 'https://www.youtube.com/watch?v=ccccccccccc',
    type: 'youtube_transcript',
    content: 'Lifetimes tell the compiler how long a borrow is valid. Annotate them when inference is not enough.',
    timestamp: '2026-03-01T10:00:00.000Z',
    meta: { channel: 'Code Corner', videoId: 'ccccccccccc', durationSec: 1200 },
    tags: [tag('topic', 'rust'), tag('topic', 'programming')],
  },
  {
    id: 'web-article',
    title: 'A page about gardening',
    url: 'https://example.com/gardening',
    type: 'webpage_text',
    content: 'Tomatoes need sun and water.',
    timestamp: '2026-02-01T10:00:00.000Z',
    tags: [tag('topic', 'gardening')],
  },
];
