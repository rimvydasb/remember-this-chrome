import { notifications } from '@mantine/notifications';
import { useEffect, useState } from 'react';
import { ItemDeletedError } from '../../../../followups/errors';
import { RelatedSearchError, type RelatedProgress } from '../../../../followups/related/RelatedArticlesPipeline';
import { relatedArticlesPipeline } from '../../../../followups/services';
import { errorMessage } from '../../../../llm';
import { GOOGLE_HOST_PERMISSION } from '../../../../shared/googleSearch';
import type { FollowUp, SavedItem } from '../../../../shared/types';
import { useLlmGate } from '../common/useLlmGate';
import { readCooldown, startCooldown, type SearchCooldown } from './cooldown';

export interface RelatedError {
  message: string;
  /** The queries that were written, so the user sees what ran. */
  queries: readonly string[];
}

export interface RelatedArticlesState {
  /** Earlier searches, newest first. */
  searches: readonly FollowUp[];
  /** Progress of the running search; undefined when idle. */
  progress: RelatedProgress | undefined;
  error: RelatedError | undefined;
  /** Set while Google searches pause after a block. */
  cooldown: SearchCooldown | undefined;
  canSearch: boolean;
  find: () => Promise<void>;
  remove: (search: FollowUp) => void;
}

/** Text of a progress step: "Writing queries…", "Searching 2 of 4…". */
export function progressLabel(progress: RelatedProgress): string {
  return progress.step === 'queries' ? 'Writing queries…' : `Searching ${progress.index} of ${progress.total}…`;
}

/** Holds the cooldown in state and clears it when it ends. */
function useCooldown(): [SearchCooldown | undefined, (reason: string) => void] {
  const [cooldown, setCooldown] = useState(() => readCooldown());
  useEffect(() => {
    if (!cooldown) return;
    const timer = setTimeout(() => setCooldown(readCooldown()), Math.max(0, cooldown.until - Date.now()) + 50);
    return () => clearTimeout(timer);
  }, [cooldown]);
  return [cooldown, (reason) => setCooldown(startCooldown(reason))];
}

/** The state and actions of the related articles of an item. */
export function useRelatedArticles(item: SavedItem): RelatedArticlesState {
  const gate = useLlmGate();
  const [progress, setProgress] = useState<RelatedProgress>();
  const [error, setError] = useState<RelatedError>();
  const [cooldown, pause] = useCooldown();

  const find = async () => {
    if (progress || readCooldown()) return;
    // Before any `await`: Chrome shows the permission prompt only during the click.
    const access = gate.begin([GOOGLE_HOST_PERMISSION]);
    if (!access) return;
    setError(undefined);
    setProgress({ step: 'queries' });
    try {
      await access.permission;
      const { followUp, aborted } = await relatedArticlesPipeline.run(
        { settings: access.llm, item },
        { onProgress: setProgress },
      );
      const count = followUp.articles?.length ?? 0;
      notifications.show({ color: 'teal', message: `Found ${count} related ${count === 1 ? 'article' : 'articles'}.` });
      if (aborted?.blocking) pause(aborted.message);
    } catch (caught) {
      if (caught instanceof ItemDeletedError) {
        notifications.show({ color: 'red', message: 'Cannot save the articles: the item was deleted.' });
      } else if (caught instanceof RelatedSearchError) {
        setError({ message: caught.message, queries: caught.queries });
        if (caught.blocking) pause(caught.message);
      } else {
        setError({ message: errorMessage(caught), queries: [] });
      }
    } finally {
      setProgress(undefined);
    }
  };

  return {
    searches: relatedArticlesPipeline.list(item),
    progress,
    error,
    cooldown,
    canSearch: gate.ready && !progress && !cooldown,
    find,
    remove: (search) => void relatedArticlesPipeline.remove(item, search),
  };
}
