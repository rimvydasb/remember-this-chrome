import { notifications } from '@mantine/notifications';
import { useMutation } from '@tanstack/react-query';
import { sentimentPipeline } from '../../../../followups/services';
import { errorMessage } from '../../../../llm';
import { findSentiment, type SentimentDefinition } from '../../../../shared/sentiment';
import type { LlmSettings } from '../../../../shared/settings';
import type { SavedItem } from '../../../../shared/types';
import { useLlmGate } from '../common/useLlmGate';
import { aiActivity } from '../../aiActivity';

export interface SentimentState {
  /** When and by which model the current sentiments were generated; undefined when there are none. */
  generated: { createdAt: string; model?: string } | undefined;
  /** The current sentiments, in the order the model gave them. */
  sentiments: SentimentDefinition[];
  generating: boolean;
  /** The error of the last analysis; cleared by the next one. */
  error: string | undefined;
  canGenerate: boolean;
  generate: () => Promise<void>;
  remove: () => void;
}

/** The state and actions of the sentiment of an item. */
export function useSentiment(item: SavedItem): SentimentState {
  const gate = useLlmGate();
  const tags = sentimentPipeline.current(item);
  const sentiments = tags.flatMap((tag) => findSentiment(tag.label) ?? []);

  const mutation = useMutation({
    mutationFn: (llm: LlmSettings) =>
      aiActivity.track('Analyzing sentiment', item.title, () => sentimentPipeline.run({ settings: llm, item })),
    onSuccess: () =>
      notifications.show({ color: 'teal', message: `Sentiment added to “${item.title || 'Untitled'}”.` }),
    onError: (error) =>
      notifications.show({
        color: 'red',
        title: 'Cannot analyze sentiment',
        message: error.message,
        autoClose: 10_000,
      }),
  });

  return {
    generated: tags[0] && { createdAt: tags[0].createdAt, model: tags[0].model },
    sentiments,
    generating: mutation.isPending,
    error: mutation.isError ? mutation.error.message : undefined,
    canGenerate: gate.ready,
    generate: async () => {
      const access = gate.begin();
      if (!access) return;
      try {
        await access.permission;
      } catch (error) {
        mutation.reset();
        notifications.show({ color: 'red', title: 'Cannot analyze sentiment', message: errorMessage(error) });
        return;
      }
      mutation.mutate(access.llm);
    },
    remove: () => {
      if (tags.length > 0) void sentimentPipeline.remove(item);
    },
  };
}
