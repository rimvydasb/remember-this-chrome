import { notifications } from '@mantine/notifications';
import { useMutation } from '@tanstack/react-query';
import { summaryPipeline } from '../../../../followups/services';
import { errorMessage } from '../../../../llm';
import type { LlmSettings } from '../../../../shared/settings';
import type { FollowUp, SavedItem } from '../../../../shared/types';
import { useLlmGate } from '../common/useLlmGate';

export interface SummaryState {
  summary: FollowUp | undefined;
  generating: boolean;
  /** The error of the last generation; cleared by the next one. */
  error: string | undefined;
  canGenerate: boolean;
  generate: () => Promise<void>;
  remove: () => void;
}

/** The state and actions of the summary of an item. */
export function useSummary(item: SavedItem): SummaryState {
  const gate = useLlmGate();
  const summary = summaryPipeline.current(item);

  const mutation = useMutation({
    mutationFn: (llm: LlmSettings) => summaryPipeline.run({ settings: llm, item }),
    onSuccess: () => notifications.show({ color: 'teal', message: `Summary added to “${item.title || 'Untitled'}”.` }),
    onError: (error) =>
      notifications.show({ color: 'red', title: 'Cannot summarize', message: error.message, autoClose: 10_000 }),
  });

  return {
    summary,
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
        notifications.show({ color: 'red', title: 'Cannot summarize', message: errorMessage(error) });
        return;
      }
      mutation.mutate(access.llm);
    },
    remove: () => {
      if (summary) void summaryPipeline.remove(item, summary);
    },
  };
}
