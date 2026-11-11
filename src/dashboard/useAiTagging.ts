import { useEffect, useRef, useState } from 'react';
import { isAiGeneratedTags } from '../shared/keywords';
import { generateTags, hasLlmPermission, listModels } from '../shared/llm';
import { setAiTags } from '../shared/storage';
import type { SavedItem } from '../shared/types';
import { useSettings } from './useSettings';

/** Wait before the next try when the server is not reachable or the permission is missing. */
const RETRY_MS = 5 * 60_000;

/** True when the item still needs AI tags. Forgotten and empty items are skipped. */
const needsTags = (item: SavedItem) =>
  !isAiGeneratedTags(item) && item.mark !== 'forgotten' && item.content.trim() !== '';

const attemptKey = (item: SavedItem) => `${item.id}\u0000${item.timestamp}`;

/**
 * Generates AI tags in the background while the dashboard is open, when "Use LLM for tagging" is on.
 * Items are tagged one at a time: the open item first, then newest first. Until an item has AI tags,
 * it shows the tags of keyword extraction.
 *
 * When the server does not answer, or the extension has no permission to call it yet, tagging
 * pauses and tries again later. An item whose tagging fails while the server answers is skipped
 * until the dashboard is opened again or the item changes.
 *
 * Returns the ID of the item that is being tagged now.
 */
export function useAiTagging(items: readonly SavedItem[], priorityId: string | undefined): string | undefined {
  const llm = useSettings()?.llm;
  const [currentId, setCurrentId] = useState<string>();
  const itemsRef = useRef(items);
  const priorityRef = useRef(priorityId);
  /** Items tried in this session (tagged or failed), by ID and timestamp. */
  const attemptedRef = useRef(new Set<string>());
  /** Starts the loop when it is idle. Set by the loop effect. */
  const wakeRef = useRef<() => void>(() => {});

  itemsRef.current = items;
  priorityRef.current = priorityId;

  const enabled = llm?.useForTags ?? false;
  const baseUrl = llm?.baseUrl;
  const model = llm?.model;

  useEffect(() => {
    if (!enabled || !llm) return;
    const settings = llm;
    let stopped = false;
    let running = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const reachable = () =>
      listModels(settings).then(
        () => true,
        () => false,
      );

    const next = (): SavedItem | undefined => {
      const candidates = itemsRef.current.filter(
        (item) => needsTags(item) && !attemptedRef.current.has(attemptKey(item)),
      );
      return candidates.find((item) => item.id === priorityRef.current) ?? candidates[0];
    };

    const pause = () => {
      timer = setTimeout(() => void run(), RETRY_MS);
    };

    const run = async () => {
      if (running || stopped) return;
      running = true;
      timer = undefined;
      try {
        if (!next()) return;
        if (!(await hasLlmPermission(settings.baseUrl)) || !(await reachable())) return pause();
        for (let item = next(); item && !stopped; item = next()) {
          setCurrentId(item.id);
          try {
            const aiTags = await generateTags(settings, item);
            await setAiTags(item.id, aiTags, { onlyIfMissing: true });
            // Do not ask for the same item again before the library update arrives.
            attemptedRef.current.add(attemptKey(item));
          } catch (error) {
            if (stopped) return;
            if (!(await reachable())) return pause();
            console.warn(`AI tagging failed for “${item.title}”`, error);
            attemptedRef.current.add(attemptKey(item));
          }
        }
      } finally {
        running = false;
        if (!stopped) setCurrentId(undefined);
      }
    };

    wakeRef.current = () => {
      if (!running && !timer) void run();
    };
    void run();
    return () => {
      stopped = true;
      clearTimeout(timer);
      wakeRef.current = () => {};
      setCurrentId(undefined);
    };
    // Restart only when the settings that tagging uses change, not on every settings object.
  }, [enabled, baseUrl, model]);

  // New or changed items: start the loop if it is idle.
  useEffect(() => wakeRef.current(), [items]);

  return currentId;
}
