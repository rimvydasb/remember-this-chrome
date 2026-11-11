import type { RawSegment } from '../shared/transcript';

export interface ExtractionSuccess {
  ok: true;
  videoId: string;
  title: string;
  channel?: string;
  language?: string;
  durationSec?: number;
  /** Full description text (URLs are not shortened). */
  description?: string;
  /** Exact view count, as YouTube reports it (digits, maybe with separators). */
  viewCount?: string;
  /** Chapters from the player bar (author or auto-generated), when the page data has them. */
  chapters?: { startSec: number; title: string }[];
  source: 'innertube' | 'timedtext' | 'transcript-panel';
  segments: RawSegment[];
  elapsedMs: number;
}

export interface ExtractionFailure {
  ok: false;
  code: 'not_watch_page' | 'no_captions' | 'extraction_failed';
  error: string;
  details?: string[];
}

export type ExtractionResult = ExtractionSuccess | ExtractionFailure;

/**
 * Extracts the transcript of the video on the current YouTube watch page.
 *
 * The background worker injects this function with `chrome.scripting.executeScript` into the
 * page's MAIN world. It runs in the active browser context, so all requests are same-origin
 * requests to youtube.com with the user's cookies (and YouTube Premium / membership access).
 *
 * IMPORTANT: Chrome serializes this function with `Function.prototype.toString()`. It must be
 * fully self-contained: no imports, no references to module-scope values. Only type imports are
 * allowed.
 *
 * Strategies, in order:
 * 1. Caption track (`timedtext`) from the player response. YouTube now requires a proof-of-origin
 *    token on these URLs, so the extractor reuses (or briefly makes the player create) a URL that
 *    the player signed itself. The plain track URL is tried too.
 * 2. InnerTube `get_transcript` (the API behind the "Show transcript" panel). As of late 2026
 *    YouTube rejects most script calls with FAILED_PRECONDITION, so it is a fallback only.
 * 3. Segments from the transcript panel, when the user has it open.
 */
export async function extractYouTubeTranscript(): Promise<ExtractionResult> {
  const startedAt = performance.now();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Any = any;
  const win = window as Any;
  const details: string[] = [];

  const videoId = new URL(location.href).searchParams.get('v');
  if (location.pathname !== '/watch' || !videoId) {
    return { ok: false, code: 'not_watch_page', error: 'Open a YouTube video page first.' };
  }

  const cfg = (key: string): Any => {
    try {
      return win.ytcfg?.get?.(key) ?? win.ytcfg?.data_?.[key];
    } catch {
      return undefined;
    }
  };

  /** Finds `name = {...};` in page HTML and parses the JSON object (brace matching aware of strings). */
  const extractJsonAssignment = (html: string, name: string): Any => {
    const marker = html.search(new RegExp(`${name}\\s*=\\s*\\{`));
    if (marker === -1) return undefined;
    const start = html.indexOf('{', marker);
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < html.length; i++) {
      const ch = html[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === '{') depth++;
      else if (ch === '}' && --depth === 0) {
        try {
          return JSON.parse(html.slice(start, i + 1));
        } catch {
          return undefined;
        }
      }
    }
    return undefined;
  };

  /** Depth-first search for every object stored under `key`. */
  const findAll = (root: Any, key: string, limit = Infinity): Any[] => {
    const found: Any[] = [];
    const stack: Any[] = [root];
    while (stack.length > 0 && found.length < limit) {
      const node = stack.pop();
      if (!node || typeof node !== 'object') continue;
      if (Array.isArray(node)) {
        for (let i = node.length - 1; i >= 0; i--) stack.push(node[i]);
        continue;
      }
      for (const k of Object.keys(node)) {
        if (k === key) found.push(node[k]);
        else if (node[k] && typeof node[k] === 'object') stack.push(node[k]);
      }
    }
    return found;
  };

  const runsText = (value: Any): string => {
    if (!value) return '';
    if (typeof value.simpleText === 'string') return value.simpleText;
    if (Array.isArray(value.runs)) return value.runs.map((run: Any) => run?.text ?? '').join('');
    return '';
  };

  // --- Player response and page data for the *current* video (YouTube is a single-page app,
  // so `ytInitialPlayerResponse` can belong to an earlier video). ---
  const playerElement = document.getElementById('movie_player') as Any;
  let player: Any;
  try {
    const response = playerElement?.getPlayerResponse?.();
    if (response?.videoDetails?.videoId === videoId) player = response;
  } catch {
    /* ignore */
  }
  if (!player && win.ytInitialPlayerResponse?.videoDetails?.videoId === videoId) {
    player = win.ytInitialPlayerResponse;
  }

  const matchesVideo = (data: Any) => data?.currentVideoEndpoint?.watchEndpoint?.videoId === videoId;
  let pageData: Any;
  if (matchesVideo(win.ytInitialData)) pageData = win.ytInitialData;
  if (!pageData) {
    try {
      const flexy = document.querySelector('ytd-watch-flexy') as Any;
      const candidate = flexy?.data ?? flexy?.__data?.data;
      if (matchesVideo(candidate)) pageData = candidate;
    } catch {
      /* ignore */
    }
  }

  if (!player || !pageData) {
    try {
      const response = await fetch(`/watch?v=${encodeURIComponent(videoId)}`, { credentials: 'include' });
      const html = await response.text();
      player ??= extractJsonAssignment(html, 'ytInitialPlayerResponse');
      pageData ??= extractJsonAssignment(html, 'ytInitialData');
    } catch (error) {
      details.push(`watch page fetch: ${String(error)}`);
    }
  }

  const title: string =
    player?.videoDetails?.title ?? document.title.replace(/^\(\d+\)\s*/, '').replace(/\s*-\s*YouTube$/, '');
  const channel: string | undefined = player?.videoDetails?.author;
  const durationSec = Number(player?.videoDetails?.lengthSeconds) || undefined;
  const tracks: Any[] = player?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];

  // --- Description, view count, chapters ---
  const firstString = (...values: Any[]): string | undefined =>
    values.find((value) => typeof value === 'string' && value.trim() !== '');
  const description = firstString(
    player?.videoDetails?.shortDescription,
    findAll(pageData, 'attributedDescription', 1)[0]?.content,
    findAll(pageData, 'attributedDescriptionBodyText', 1)[0]?.content,
  );
  const viewCountRenderer = findAll(pageData, 'videoViewCountRenderer', 1)[0];
  const viewCount = firstString(
    player?.videoDetails?.viewCount,
    viewCountRenderer?.originalViewCount,
    runsText(viewCountRenderer?.viewCount),
  );
  const chapters: { startSec: number; title: string }[] = [];
  try {
    for (const chapter of findAll(pageData, 'chapterRenderer')) {
      const startMs = Number(chapter?.timeRangeStartMillis);
      const chapterTitle = runsText(chapter?.title).trim();
      if (Number.isFinite(startMs) && chapterTitle)
        chapters.push({ startSec: Math.floor(startMs / 1000), title: chapterTitle });
    }
  } catch {
    /* ignore: chapters are optional */
  }

  const success = (
    source: ExtractionSuccess['source'],
    segments: RawSegment[],
    language?: string,
  ): ExtractionSuccess => ({
    ok: true,
    videoId,
    title,
    channel,
    durationSec,
    language,
    description,
    viewCount,
    chapters: chapters.length > 0 ? chapters : undefined,
    source,
    segments,
    elapsedMs: Math.round(performance.now() - startedAt),
  });

  // --- InnerTube get_transcript (used as strategy 2, below) ---
  const sapisidHash = async (): Promise<string | undefined> => {
    const cookies = Object.fromEntries(
      document.cookie.split(/;\s*/).map((pair) => {
        const index = pair.indexOf('=');
        return [pair.slice(0, index), pair.slice(index + 1)];
      }),
    );
    const sapisid = cookies.SAPISID ?? cookies['__Secure-3PAPISID'];
    if (!sapisid) return undefined;
    const timestamp = Math.floor(Date.now() / 1000);
    const digest = await crypto.subtle.digest(
      'SHA-1',
      new TextEncoder().encode(`${timestamp} ${sapisid} ${location.origin}`),
    );
    const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
    return `SAPISIDHASH ${timestamp}_${hex}`;
  };

  const transcriptParams: string | undefined = findAll(pageData, 'getTranscriptEndpoint', 1)[0]?.params;
  const tryInnertube = async (): Promise<ExtractionSuccess | undefined> => {
    if (!transcriptParams) {
      details.push('get_transcript: no transcript endpoint on page');
      return undefined;
    }
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const clientName = cfg('INNERTUBE_CONTEXT_CLIENT_NAME');
      const clientVersion = cfg('INNERTUBE_CLIENT_VERSION');
      if (clientName) headers['X-Youtube-Client-Name'] = String(clientName);
      if (clientVersion) headers['X-Youtube-Client-Version'] = String(clientVersion);
      const visitorData = cfg('VISITOR_DATA');
      if (visitorData) headers['X-Goog-Visitor-Id'] = String(visitorData);
      const authorization = await sapisidHash();
      if (authorization) {
        headers.Authorization = authorization;
        headers['X-Goog-AuthUser'] = String(cfg('SESSION_INDEX') ?? 0);
        headers['X-Origin'] = location.origin;
      }
      const context = cfg('INNERTUBE_CONTEXT') ?? {
        client: { clientName: 'WEB', clientVersion: clientVersion ?? '2.20250101.00.00', hl: 'en' },
      };
      const response = await fetch('/youtubei/v1/get_transcript?prettyPrint=false', {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({ context, params: transcriptParams }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = await response.json();
      const segments: RawSegment[] = findAll(json, 'transcriptSegmentRenderer')
        .map((segment: Any) => {
          const startMs = Number(segment?.startMs) || 0;
          const endMs = Number(segment?.endMs) || startMs;
          return { startMs, durationMs: Math.max(0, endMs - startMs), text: runsText(segment?.snippet) };
        })
        .filter((segment) => segment.text.trim() !== '')
        .sort((a, b) => a.startMs - b.startMs);
      if (segments.length > 0) {
        const languageMenu = findAll(json, 'subMenuItems', 1)[0];
        const selected = Array.isArray(languageMenu)
          ? languageMenu.find((entry: Any) => entry?.selected)?.title
          : undefined;
        return success('innertube', segments, typeof selected === 'string' ? selected : undefined);
      }
      details.push('get_transcript: no segments in response');
    } catch (error) {
      details.push(`get_transcript: ${String(error)}`);
    }
    return undefined;
  };

  // --- Caption track (timedtext) helpers ---
  const parseCaptionBody = (body: string): RawSegment[] => {
    const trimmed = body.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('{')) {
      const json = JSON.parse(trimmed);
      return (json.events ?? [])
        .filter((event: Any) => Array.isArray(event.segs))
        .map((event: Any) => ({
          startMs: Number(event.tStartMs) || 0,
          durationMs: Number(event.dDurationMs) || 0,
          text: event.segs.map((seg: Any) => seg.utf8 ?? '').join(''),
        }))
        .filter((segment: RawSegment) => segment.text.trim() !== '');
    }
    const xml = new DOMParser().parseFromString(trimmed, 'text/xml');
    const legacy = [...xml.getElementsByTagName('text')];
    if (legacy.length > 0) {
      return legacy.map((node) => ({
        startMs: Math.round(Number(node.getAttribute('start') ?? 0) * 1000),
        durationMs: Math.round(Number(node.getAttribute('dur') ?? 0) * 1000),
        text: node.textContent ?? '',
      }));
    }
    return [...xml.getElementsByTagName('p')].map((node) => ({
      startMs: Number(node.getAttribute('t') ?? 0),
      durationMs: Number(node.getAttribute('d') ?? 0),
      text: node.textContent ?? '',
    }));
  };

  const fetchCaptions = async (url: string): Promise<RawSegment[]> => {
    const target = new URL(url, location.origin);
    target.searchParams.set('fmt', 'json3');
    const response = await fetch(target.toString(), { credentials: 'include' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return parseCaptionBody(await response.text());
  };

  const isTimedTextForVideo = (name: string) =>
    name.includes('/api/timedtext') && name.includes(`v=${videoId}`) && name.includes('pot=');

  /** A timedtext URL the player already requested (signed with a `pot` token), if any. */
  const findLoadedTimedTextUrl = (): string | undefined =>
    performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .reverse()
      .find(isTimedTextForVideo);

  /** Makes the player request a signed timedtext URL and returns it. */
  const requestSignedTimedTextUrl = async (): Promise<string | undefined> => {
    if (!playerElement?.toggleSubtitles) return undefined;

    // Turn captions on briefly so the player requests a signed track URL, then restore the state.
    let observed: string | undefined;
    const observer = new PerformanceObserver((list) => {
      observed ??= list
        .getEntries()
        .map((entry) => entry.name)
        .find(isTimedTextForVideo);
    });
    observer.observe({ type: 'resource', buffered: false });
    let wasOn = false;
    try {
      wasOn = Boolean(playerElement.isSubtitlesOn?.());
      if (!wasOn) playerElement.toggleSubtitles();
      for (let waited = 0; waited < 4000 && !observed; waited += 100) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    } finally {
      observer.disconnect();
      if (!wasOn) {
        try {
          playerElement.toggleSubtitles();
        } catch {
          /* ignore */
        }
      }
    }
    return observed;
  };

  // --- Strategy 1: caption track (timedtext) ---
  if (tracks.length > 0) {
    const uiLanguage = String(cfg('HL') ?? navigator.language ?? 'en').split('-')[0];
    const isAsr = (track: Any) => track?.kind === 'asr';
    const track =
      tracks.find((t) => !isAsr(t) && String(t.languageCode).split('-')[0] === uiLanguage) ??
      tracks.find((t) => !isAsr(t)) ??
      tracks[0];
    const language = runsText(track?.name) || track?.languageCode;

    /** Fetches the chosen track through a signed URL (which may point to another language). */
    const fetchViaSigned = async (signed: string): Promise<RawSegment[]> => {
      const url = new URL(signed, location.origin);
      url.searchParams.delete('tlang');
      if (track.languageCode) url.searchParams.set('lang', track.languageCode);
      if (isAsr(track)) url.searchParams.set('kind', 'asr');
      else url.searchParams.delete('kind');
      const segments = await fetchCaptions(url.toString());
      return segments.length > 0 ? segments : fetchCaptions(signed);
    };

    // Since 2025 the plain track URL usually returns an empty body: YouTube requires a
    // proof-of-origin (`pot`) token that only the player adds. Order: cheapest first.
    const attempts: [string, () => Promise<RawSegment[]>][] = [
      [
        'signed URL already loaded',
        async () => {
          const loaded = findLoadedTimedTextUrl();
          return loaded ? fetchViaSigned(loaded) : [];
        },
      ],
      ['plain track URL', () => fetchCaptions(track.baseUrl)],
      [
        'signed URL from player',
        async () => {
          const signed = await requestSignedTimedTextUrl();
          return signed ? fetchViaSigned(signed) : [];
        },
      ],
    ];
    for (const [label, attempt] of attempts) {
      try {
        const segments = await attempt();
        if (segments.length > 0) return success('timedtext', segments, language);
        details.push(`timedtext (${label}): no caption lines`);
      } catch (error) {
        details.push(`timedtext (${label}): ${String(error)}`);
      }
    }
  } else {
    details.push('timedtext: video has no caption tracks');
  }

  // --- Strategy 2: InnerTube get_transcript (often rejected with FAILED_PRECONDITION now) ---
  const fromInnertube = await tryInnertube();
  if (fromInnertube) return fromInnertube;

  // --- Strategy 3: transcript panel already open on the page ---
  const panelSegments: RawSegment[] = [...document.querySelectorAll('ytd-transcript-segment-renderer')].map((node) => {
    const stamp = node.querySelector('.segment-timestamp')?.textContent?.trim() ?? '0:00';
    const startMs = stamp.split(':').reduce((total, part) => total * 60 + (Number(part) || 0), 0) * 1000;
    return { startMs, durationMs: 0, text: node.querySelector('.segment-text')?.textContent ?? '' };
  });
  if (panelSegments.some((segment) => segment.text.trim())) return success('transcript-panel', panelSegments);

  if (tracks.length === 0 && !transcriptParams) {
    return { ok: false, code: 'no_captions', error: 'This video has no transcript or captions.', details };
  }
  return {
    ok: false,
    code: 'extraction_failed',
    error: 'Could not read the transcript. Try opening "Show transcript" under the video, then capture again.',
    details,
  };
}
