import { Badge, Loader } from '@mantine/core';
import { IconSparkles } from '@tabler/icons-react';
import type { SavedItem } from '../../shared/types';
import { useGenerateTags } from './useGenerateTags';

interface AiTagsButtonProps {
  item: SavedItem;
  /** True while background tagging works on this item. */
  busy?: boolean;
}

/** Chip after the tags of an item that has no AI tags: generates them with the LLM. */
export function AiTagsButton({ item, busy = false }: AiTagsButtonProps) {
  const { ready, generating, generate } = useGenerateTags(item);
  const working = generating || busy;

  return (
    <Badge
      component="button"
      type="button"
      size="sm"
      radius="sm"
      tt="none"
      fw={500}
      variant="outline"
      className="rt-keyword"
      leftSection={working ? <Loader size={10} /> : <IconSparkles size={12} />}
      title="These tags come from keyword extraction. Ask the LLM for better ones."
      aria-busy={working}
      disabled={!ready || working}
      onClick={() => void generate()}
    >
      {working ? 'Generating tags…' : 'Regenerate tags with AI'}
    </Badge>
  );
}
