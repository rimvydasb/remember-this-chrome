import { notifications } from '@mantine/notifications';
import { useMutation } from '@tanstack/react-query';
import { taggingPipeline } from '../../followups/services';
import { errorMessage } from '../../llm';
import type { LlmSettings } from '../../shared/settings';
import type { SavedItem } from '../../shared/types';
import { aiActivity } from './aiActivity';
import { useLlmGate } from './panels/common/useLlmGate';

/** Generates AI tags for one item on demand (the chip in the reader). */
export function useGenerateTags(item: SavedItem) {
  const gate = useLlmGate();
  const mutation = useMutation({
    mutationFn: (llm: LlmSettings) =>
      aiActivity.track('Generating tags', item.title, () => taggingPipeline.run({ settings: llm, item })),
    onError: (error) =>
      notifications.show({ color: 'red', title: 'Cannot generate tags', message: error.message, autoClose: 10_000 }),
  });

  return {
    ready: gate.ready,
    generating: mutation.isPending,
    generate: async () => {
      const access = gate.begin();
      if (!access) return;
      try {
        await access.permission;
      } catch (error) {
        notifications.show({ color: 'red', title: 'Cannot generate tags', message: errorMessage(error) });
        return;
      }
      mutation.mutate(access.llm);
    },
  };
}
