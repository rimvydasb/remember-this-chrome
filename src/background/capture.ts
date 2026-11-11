import { extractYouTubeTranscript, type ExtractionResult } from '../content/youtubeExtractor';
import { upsertCapture } from '../shared/storage';
import { fetchThumbnail } from '../shared/thumbnail';
import { countWords, formatTranscript } from '../shared/transcript';
import type { CaptureResponse } from '../shared/types';
import { buildVideoMeta } from '../shared/videoDetails';
import { canonicalYouTubeUrl, getYouTubeVideoId } from '../shared/youtube';

async function runExtractor(tabId: number): Promise<ExtractionResult> {
  const [injection] = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: extractYouTubeTranscript,
  });
  const result = injection?.result as ExtractionResult | undefined;
  if (!result) throw new Error('The page returned no result.');
  return result;
}

/** Captures the content of a tab and saves it to the library. */
export async function captureTab(tabId: number): Promise<CaptureResponse> {
  const tab = await chrome.tabs.get(tabId);

  if (!getYouTubeVideoId(tab.url)) {
    // FR-2.1: general web page capture is a Phase II feature.
    return {
      ok: false,
      code: 'not_implemented',
      error: 'Capturing text from regular web pages is not implemented yet. It is planned for Phase II.',
    };
  }

  let result: ExtractionResult;
  try {
    result = await runExtractor(tabId);
  } catch (error) {
    return {
      ok: false,
      code: 'injection_failed',
      error: `Could not access the page. Reload the tab and try again. (${error instanceof Error ? error.message : String(error)})`,
    };
  }

  if (!result.ok) {
    if (result.details?.length) console.warn('[Remember This] extraction details:', result.details);
    return { ok: false, code: result.code, error: result.error };
  }

  const content = formatTranscript(result.segments);
  if (!content) {
    return { ok: false, code: 'empty_transcript', error: 'The transcript is empty after cleanup.' };
  }

  const meta = buildVideoMeta(result);
  // A failed download must not fail the capture; the item then has no thumbnail.
  const thumbnail = await fetchThumbnail(result.videoId);
  if (thumbnail) meta.thumbnail = thumbnail;

  const { item, created, changed } = await upsertCapture(
    {
      title: result.title,
      url: canonicalYouTubeUrl(result.videoId),
      type: 'youtube_transcript',
      content,
      meta,
    },
    { fallbackTitle: `YouTube video ${result.videoId}` },
  );

  return {
    ok: true,
    item,
    created,
    changed,
    stats: {
      extractMs: result.elapsedMs,
      words: countWords(content),
      paragraphs: content.split('\n\n').length,
      source: result.source,
    },
  };
}
