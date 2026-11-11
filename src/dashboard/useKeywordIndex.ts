import { useEffect, useMemo, useRef, useState } from 'react';
import {
  buildKeywordIndex,
  isAiGeneratedTags,
  termCacheKey,
  type KeywordIndex,
  type TermCache,
} from '../shared/keywords';
import type { SavedItem } from '../shared/types';
import type { TermJob, TermRequest, TermResponse } from './termWorker';

/** Least time between two index rebuilds while the worker reports results. */
const REFRESH_MS = 500;

/**
 * Extracts keywords for the library. New or changed items go to a worker; their keywords appear
 * as results arrive. `ready` is false until all of them are done. Unchanged items are never
 * extracted again while the dashboard is open.
 */
export function useKeywordIndex(items: readonly SavedItem[]): { index: KeywordIndex; ready: boolean } {
  const cacheRef = useRef<TermCache>(new Map());
  const workerRef = useRef<Worker | null>(null);
  const requestRef = useRef(0);
  const [warmedFor, setWarmedFor] = useState<readonly SavedItem[] | null>(null);
  /** Bumped when new results are in the cache, so the index is built again. */
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const worker = new Worker(new URL('./termWorker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;
    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const worker = workerRef.current;
    if (!worker) return;
    const cache = cacheRef.current;

    // Drop entries of deleted or changed items.
    const live = new Set(items.map(termCacheKey));
    for (const key of cache.keys()) if (!live.has(key)) cache.delete(key);

    const jobs: TermJob[] = [];
    for (const item of items) {
      if (isAiGeneratedTags(item)) continue;
      const key = termCacheKey(item);
      if (!cache.has(key)) jobs.push({ key, item: { title: item.title, content: item.content, meta: item.meta } });
    }
    if (jobs.length === 0) {
      setWarmedFor(items);
      return;
    }

    const request = ++requestRef.current;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      timer = undefined;
      setVersion((v) => v + 1);
    };
    const onMessage = (event: MessageEvent<TermResponse>) => {
      const message = event.data;
      if ('terms' in message) {
        if (live.has(message.key)) cache.set(message.key, message.terms);
        timer ??= setTimeout(refresh, REFRESH_MS);
      } else if ('error' in message) {
        console.warn('Keyword extraction failed', message.error);
      } else if (message.request === request) {
        clearTimeout(timer);
        refresh();
        setWarmedFor(items);
      }
    };
    worker.addEventListener('message', onMessage);
    worker.postMessage({ request, jobs } satisfies TermRequest);
    return () => {
      worker.removeEventListener('message', onMessage);
      clearTimeout(timer);
    };
  }, [items]);

  const ready = warmedFor === items;
  // `version` marks new results in the cache.
  const index = useMemo(() => buildKeywordIndex(items, cacheRef.current), [items, version]);
  return { index, ready };
}
