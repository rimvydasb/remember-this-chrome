import { getAllItems, putItems } from './storage';
import type { SavedItem } from './types';
import { getYouTubeVideoId } from './youtube';

const WIDTH = 240;
const HEIGHT = 135;

/**
 * Downloads the thumbnail of a YouTube video and shrinks it to a small JPEG data URL (about
 * 5-10 kB), so it can be stored with the item. Returns undefined when anything fails.
 */
export async function fetchThumbnail(videoId: string): Promise<string | undefined> {
  try {
    const response = await fetch(`https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/mqdefault.jpg`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const bitmap = await createImageBitmap(await response.blob());
    const canvas = new OffscreenCanvas(WIDTH, HEIGHT);
    const context = canvas.getContext('2d');
    if (!context) return undefined;
    context.drawImage(bitmap, 0, 0, WIDTH, HEIGHT);
    bitmap.close();
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.75 });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return `data:image/jpeg;base64,${btoa(binary)}`;
  } catch (error) {
    console.warn('[Remember This] thumbnail download failed for', videoId, error);
    return undefined;
  }
}

const videoIdOf = (item: SavedItem) =>
  item.type === 'youtube_transcript' ? (item.meta?.videoId ?? getYouTubeVideoId(item.url)) : null;

/** Counts the YouTube items that have no stored thumbnail. */
export async function countMissingThumbnails(): Promise<number> {
  return (await getAllItems()).filter((item) => videoIdOf(item) && !item.meta?.thumbnail).length;
}

/** Downloads the thumbnails that items lack. Returns how many were saved and how many failed. */
export async function backfillThumbnails(): Promise<{ saved: number; failed: number }> {
  const missing = (await getAllItems()).filter((item) => videoIdOf(item) && !item.meta?.thumbnail);
  let saved = 0;
  let failed = 0;
  for (const item of missing) {
    const thumbnail = await fetchThumbnail(videoIdOf(item)!);
    if (!thumbnail) {
      failed++;
      continue;
    }
    await putItems([{ ...item, meta: { ...item.meta, thumbnail } }]);
    saved++;
  }
  return { saved, failed };
}
