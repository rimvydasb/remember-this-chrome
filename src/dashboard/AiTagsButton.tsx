import { Badge, Loader } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconSparkles } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { generateTags, LlmError, requestLlmPermission } from '../shared/llm';
import { setAiTags } from '../shared/storage';
import type { SavedItem } from '../shared/types';
import type { LlmSettings } from '../shared/settings';
import { useSettings } from './useSettings';

interface AiTagsButtonProps {
  item: SavedItem;
  /** True while background tagging works on this item. */
  busy?: boolean;
}

/** Chip after the tags of an item that has no AI tags: generates them with the LLM. */
export function AiTagsButton({ item, busy = false }: AiTagsButtonProps) {
  const settings = useSettings();
  const mutation = useMutation({
    mutationFn: async (llm: LlmSettings) => {
      const aiTags = await generateTags(llm, item);
      if (!(await setAiTags(item.id, aiTags))) throw new Error('The item was deleted.');
    },
    onError: (error) =>
      notifications.show({ color: 'red', title: 'Cannot generate tags', message: error.message, autoClose: 10_000 }),
  });
  const working = mutation.isPending || busy;

  const run = async () => {
    if (!settings || working) return;
    const llm = settings.llm;
    // The permission request must start inside the click handler (user gesture), before any await.
    const permission = requestLlmPermission(llm.baseUrl);
    try {
      if (!(await permission)) throw new LlmError(`Permission to access ${llm.baseUrl} was denied.`);
    } catch (error) {
      notifications.show({
        color: 'red',
        title: 'Cannot generate tags',
        message: String(error instanceof Error ? error.message : error),
      });
      return;
    }
    mutation.mutate(llm);
  };

  return (
    <Badge
      component="button"
      type="button"
      size="sm"
      radius="sm"
      tt="none"
      fw={500}
      variant="outline"
      color="violet"
      className="rt-keyword"
      leftSection={working ? <Loader size={10} color="violet" /> : <IconSparkles size={12} />}
      title="These tags come from keyword extraction. Ask the LLM for better ones."
      aria-busy={working}
      disabled={!settings || working}
      onClick={() => void run()}
    >
      {working ? 'Generating tags…' : 'Regenerate tags with AI'}
    </Badge>
  );
}
