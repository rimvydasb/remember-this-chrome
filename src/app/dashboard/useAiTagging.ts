import { useEffect, useRef, useState } from 'react';
import { BackgroundTagger } from '../../followups/tagging/BackgroundTagger';
import { taggingPipeline } from '../../followups/services';
import { hasLlmPermission, listModels } from '../../llm';
import type { SavedItem } from '../../shared/types';
import { useSettings } from './useSettings';

/**
 * Runs the `BackgroundTagger` while the dashboard is open and "Use LLM for tagging" is on: a thin
 * React adapter that restarts the tagger when the server settings change and wakes it when the
 * library changes. Returns the ID of the item that is being tagged now.
 */
export function useAiTagging(items: readonly SavedItem[], priorityId: string | undefined): string | undefined {
  const llm = useSettings()?.llm;
  const [currentId, setCurrentId] = useState<string>();
  const itemsRef = useRef(items);
  const priorityRef = useRef(priorityId);
  const taggerRef = useRef<BackgroundTagger>(undefined);

  itemsRef.current = items;
  priorityRef.current = priorityId;

  const enabled = llm?.useForTags ?? false;
  const baseUrl = llm?.baseUrl;
  const model = llm?.model;

  useEffect(() => {
    if (!enabled || !llm) return;
    const tagger = new BackgroundTagger({
      settings: llm,
      pipeline: taggingPipeline,
      hasPermission: hasLlmPermission,
      isReachable: (settings) =>
        listModels(settings).then(
          () => true,
          () => false,
        ),
      getItems: () => itemsRef.current,
      getPriorityId: () => priorityRef.current,
      onCurrent: setCurrentId,
      log: (message, error) => console.warn(message, error),
    });
    taggerRef.current = tagger;
    tagger.start();
    return () => {
      tagger.stop();
      taggerRef.current = undefined;
    };
    // Restart only when the settings that tagging uses change, not on every settings object.
  }, [enabled, baseUrl, model]);

  // New or changed items: start the loop if it is idle.
  useEffect(() => taggerRef.current?.wake(), [items]);

  return currentId;
}
