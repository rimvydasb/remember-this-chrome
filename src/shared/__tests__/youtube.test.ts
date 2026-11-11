import { describe, expect, it } from 'vitest';
import { canonicalYouTubeUrl, getYouTubeVideoId, isYouTubeWatchUrl } from '../youtube';

describe('youtube urls', () => {
  it.each([
    ['https://www.youtube.com/watch?v=arj7oStGLkU', 'arj7oStGLkU'],
    ['https://www.youtube.com/watch?v=arj7oStGLkU&t=42s&list=PL1', 'arj7oStGLkU'],
    ['https://m.youtube.com/watch?v=arj7oStGLkU', 'arj7oStGLkU'],
    ['https://www.youtube.com/', null],
    ['https://www.youtube.com/shorts/arj7oStGLkU', null],
    ['https://evil.example/watch?v=arj7oStGLkU', null],
    ['chrome://newtab/', null],
    [undefined, null],
  ])('%s → %s', (url, id) => {
    expect(getYouTubeVideoId(url)).toBe(id);
    expect(isYouTubeWatchUrl(url)).toBe(id !== null);
  });

  it('builds canonical URLs', () => {
    expect(canonicalYouTubeUrl('abc123def45')).toBe('https://www.youtube.com/watch?v=abc123def45');
  });
});
