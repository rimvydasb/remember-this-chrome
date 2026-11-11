import { afterEach, describe, expect, it, vi } from 'vitest';
import { extractYouTubeTranscript } from '../youtubeExtractor';

const VIDEO_ID = 'mQZB0l-rhxE';
const DESCRIPTION = 'Intro.\n\nLearn more:\nhttps://code.claude.com/docs/en/skills\n\n0:00 Start\n1:01 Middle';

const playerResponse = (extra: Record<string, unknown> = {}) => ({
  videoDetails: {
    videoId: VIDEO_ID,
    title: 'Verify your work',
    author: 'Anthropic',
    lengthSeconds: '150',
    shortDescription: DESCRIPTION,
    viewCount: '407883',
  },
  captions: {
    playerCaptionsTracklistRenderer: {
      captionTracks: [
        { baseUrl: `/api/timedtext?v=${VIDEO_ID}&lang=en`, languageCode: 'en', name: { simpleText: 'English' } },
      ],
    },
  },
  ...extra,
});

const chapter = (title: string, startMs: number) => ({
  chapterRenderer: { title: { simpleText: title }, timeRangeStartMillis: startMs },
});

const pageData = (withChapters: boolean) => ({
  currentVideoEndpoint: { watchEndpoint: { videoId: VIDEO_ID } },
  contents: {
    results: [{ videoPrimaryInfoRenderer: { viewCount: { videoViewCountRenderer: { originalViewCount: '400000' } } } }],
  },
  playerOverlays: withChapters
    ? { markersMap: [{ value: { chapters: [chapter('Auto: start', 0), chapter('Auto: next', 65_500)] } }] }
    : {},
});

const captionsJson = JSON.stringify({
  events: [
    { tStartMs: 0, dDurationMs: 1000, segs: [{ utf8: 'Hello ' }, { utf8: 'world.' }] },
    { tStartMs: 1000, dDurationMs: 500 },
    { tStartMs: 1500, dDurationMs: 1000, segs: [{ utf8: 'Bye.' }] },
  ],
});

/** Fakes the page globals the extractor reads. */
function givenPage(win: Record<string, unknown>, fetchImpl: (url: string) => Promise<Response>) {
  vi.stubGlobal('location', new URL(`https://www.youtube.com/watch?v=${VIDEO_ID}`));
  vi.stubGlobal('window', win);
  vi.stubGlobal('document', {
    title: 'Verify your work - YouTube',
    cookie: '',
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
  });
  const fetchMock = vi.fn((input: string | URL) => fetchImpl(String(input)));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const captionsFetch = async (url: string) =>
  url.includes('/api/timedtext') ? new Response(captionsJson) : new Response('', { status: 404 });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('extractYouTubeTranscript', () => {
  it('returns segments with description, view count, and chapters from the page data', async () => {
    givenPage({ ytInitialPlayerResponse: playerResponse(), ytInitialData: pageData(true) }, captionsFetch);
    const result = await extractYouTubeTranscript();

    expect(result).toMatchObject({
      ok: true,
      videoId: VIDEO_ID,
      title: 'Verify your work',
      channel: 'Anthropic',
      durationSec: 150,
      language: 'English',
      source: 'timedtext',
      description: DESCRIPTION,
      viewCount: '407883',
      chapters: [
        { startSec: 0, title: 'Auto: start' },
        { startSec: 65, title: 'Auto: next' },
      ],
      segments: [
        { startMs: 0, durationMs: 1000, text: 'Hello world.' },
        { startMs: 1500, durationMs: 1000, text: 'Bye.' },
      ],
    });
  });

  it('leaves chapters out when the page has none, and reads the view count from the page data', async () => {
    const player = playerResponse();
    delete (player.videoDetails as Partial<typeof player.videoDetails>).viewCount;
    givenPage({ ytInitialPlayerResponse: player, ytInitialData: pageData(false) }, captionsFetch);
    const result = await extractYouTubeTranscript();
    expect(result.ok && result.chapters).toBeUndefined();
    expect(result.ok && result.viewCount).toBe('400000');
  });

  it('reads the player response from the watch page HTML when the globals belong to another video', async () => {
    const html = `<script>var ytInitialPlayerResponse = ${JSON.stringify(playerResponse())};</script>
      <script>var ytInitialData = ${JSON.stringify(pageData(false))};</script>`;
    const fetchMock = givenPage({ ytInitialPlayerResponse: { videoDetails: { videoId: 'other' } } }, async (url) =>
      url.startsWith('/watch') ? new Response(html) : captionsFetch(url),
    );
    const result = await extractYouTubeTranscript();
    expect(fetchMock).toHaveBeenCalledWith(`/watch?v=${VIDEO_ID}`, { credentials: 'include' });
    expect(result).toMatchObject({ ok: true, description: DESCRIPTION, viewCount: '407883' });
  });

  it('rejects pages that are not watch pages', async () => {
    givenPage({}, captionsFetch);
    vi.stubGlobal('location', new URL('https://www.youtube.com/feed/subscriptions'));
    expect(await extractYouTubeTranscript()).toMatchObject({ ok: false, code: 'not_watch_page' });
  });

  it('reports videos without captions', async () => {
    const player = playerResponse({ captions: undefined });
    givenPage({ ytInitialPlayerResponse: player, ytInitialData: pageData(false) }, captionsFetch);
    expect(await extractYouTubeTranscript()).toMatchObject({ ok: false, code: 'no_captions' });
  });
});
