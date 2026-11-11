import { useEffect, useMemo, useRef, useState } from 'react';
import { buildKeywordIndex, warmTermCache, type KeywordIndex, type TermCache } from '../shared/keywords';
import type { SavedItem } from '../shared/types';

/** Time budget per slice when tokenizing new items, so typing and scrolling stay smooth. */
const SLICE_MS = 12;

/**
 * Extracts keywords for the library. New or changed items are tokenized in small time slices;
 * `ready` is false until all of them are done. Unchanged items are never tokenized again.
 */
export function useKeywordIndex(items: readonly SavedItem[]): { index: KeywordIndex; ready: boolean } {
  const cacheRef = useRef<TermCache>(new Map());
  const [warmedFor, setWarmedFor] = useState<readonly SavedItem[] | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const step = () => {
      const deadline = performance.now() + SLICE_MS;
      if (warmTermCache(items, cacheRef.current, () => performance.now() > deadline)) setWarmedFor(items);
      else timer = setTimeout(step, 0);
    };
    step();
    return () => clearTimeout(timer);
  }, [items]);

  const ready = warmedFor === items;
  // While new items are tokenized, keep the previous index, so existing keywords and filters stay put.
  const lastIndexRef = useRef<KeywordIndex>(new Map());
  const index = useMemo(() => {
    if (ready) lastIndexRef.current = buildKeywordIndex(items, cacheRef.current);
    return lastIndexRef.current;
  }, [items, ready]);
  return { index, ready };
}
