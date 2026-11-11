const YOUTUBE_HOSTS = new Set(['www.youtube.com', 'youtube.com', 'm.youtube.com']);

/** Returns the video ID for a YouTube watch page URL (`https://www.youtube.com/watch?v=...`), else null. */
export function getYouTubeVideoId(url: string | undefined | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (!YOUTUBE_HOSTS.has(parsed.hostname) || parsed.pathname !== '/watch') return null;
    const id = parsed.searchParams.get('v');
    return id && /^[\w-]{6,20}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

export function isYouTubeWatchUrl(url: string | undefined | null): boolean {
  return getYouTubeVideoId(url) !== null;
}

export function canonicalYouTubeUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}
