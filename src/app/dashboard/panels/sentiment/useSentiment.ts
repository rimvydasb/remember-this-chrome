import { notifications } from '@mantine/notifications';
import { useMutation } from '@tanstack/react-query';
import { sentimentPipeline } from '../../../../followups/services';
import { errorMessage } from '../../../../llm';
import { parseSentiments, type SentimentDefinition } from '../../../../shared/sentiment';
import type { LlmSettings } from '../../../../shared/settings';
import type { FollowUp, SavedItem } from '../../../../shared/types';
import { useLlmGate } from '../common/useLlmGate';

export interface SentimentState {
  sentiment: FollowUp | undefined;
  /** The sentiments of the current follow-up, in the order the model gave them. */
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
  const sentiment = sentimentPipeline.current(item);

  const mutation = useMutation({
    mutationFn: (llm: LlmSettings) => sentimentPipeline.run({ settings: llm, item }),
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
    sentiment,
    sentiments: sentiment ? parseSentiments(sentiment.generatedContent) : [],
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
      if (sentiment) void sentimentPipeline.remove(item, sentiment);
    },
  };
}
