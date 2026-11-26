import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Group,
  Stack,
  Text,
  ThemeIcon,
  Tooltip,
  type MantineSize,
} from '@mantine/core';
import { IconAlertCircle, IconMoodSmile, IconRefresh, IconTrash } from '@tabler/icons-react';
import { SENTIMENT_CATEGORIES, type SentimentDefinition } from '../../../../shared/sentiment';
import type { SavedItem } from '../../../../shared/types';
import { formatDateTime } from '../../../ui/format';
import { ContentBlock } from '../../ContentBlock';
import { CATEGORY_ICONS, MOOD_COLORS } from '../../sentimentStyle';
import { useSentiment } from './useSentiment';

/** One sentiment as a large badge: the icon of its kind and the color of its mood. */
export function SentimentBadge({ sentiment, size = 'lg' }: { sentiment: SentimentDefinition; size?: MantineSize }) {
  const CategoryIcon = CATEGORY_ICONS[sentiment.category];
  return (
    <Tooltip label={`${SENTIMENT_CATEGORIES[sentiment.category].name} sentiment`} withArrow>
      <Badge
        variant="light"
        color={MOOD_COLORS[sentiment.mood]}
        size={size}
        tt="none"
        leftSection={<CategoryIcon size={size === 'xs' ? 10 : size === 'sm' ? 12 : 14} />}
        data-mood={sentiment.mood}
      >
        {sentiment.label}
      </Badge>
    </Tooltip>
  );
}

/**
 * The AI sentiment of an item as badges, or an empty block with a button to analyze it. The same
 * sentiments also show among the item's keywords, where they work as filters.
 */
export function Sentiment({ item }: { item: SavedItem }) {
  const { generated, sentiments, generating, error, canGenerate, generate, remove } = useSentiment(item);

  const actions = generated && (
    <>
      <Tooltip label="Analyze sentiment again" withArrow>
        <ActionIcon
          variant="subtle"
          color="gray"
          aria-label="Regenerate sentiment"
          loading={generating}
          disabled={!canGenerate}
          onClick={() => void generate()}
        >
          <IconRefresh size={16} />
        </ActionIcon>
      </Tooltip>
      <Tooltip label="Delete sentiment" withArrow>
        <ActionIcon variant="subtle" color="red" aria-label="Delete sentiment" onClick={remove}>
          <IconTrash size={16} />
        </ActionIcon>
      </Tooltip>
    </>
  );

  return (
    <ContentBlock
      storageKey="sentiment"
      icon={<IconMoodSmile size={17} />}
      title="Sentiment"
      count={generated ? sentiments.length : undefined}
      actions={actions}
    >
      {generated ? (
        <Stack gap="sm">
          <Group gap="xs">
            {sentiments.map((entry) => (
              <SentimentBadge key={entry.label} sentiment={entry} />
            ))}
          </Group>
          <Text size="xs" c="dimmed">
            Generated {formatDateTime(generated.createdAt)}
            {generated.model ? ` · ${generated.model}` : ''}
          </Text>
        </Stack>
      ) : (
        <Stack align="center" gap="xs" py="md">
          <ThemeIcon variant="light" color="grape" size={40} radius="xl">
            <IconMoodSmile size={20} />
          </ThemeIcon>
          <Text size="sm" fw={500}>
            No sentiment yet
          </Text>
          <Text size="xs" c="dimmed" ta="center" maw={360}>
            Let AI read the {item.type === 'youtube_transcript' ? 'transcript' : 'page'} and tag the author’s sentiment,
            for example bullish or bearish for markets, positive or alarming for news.
          </Text>
          <Button
            mt={4}
            size="xs"
            variant="light"
            color="grape"
            leftSection={<IconMoodSmile size={15} />}
            loading={generating}
            disabled={!canGenerate}
            onClick={() => void generate()}
          >
            Analyze sentiment
          </Button>
          {error && (
            <Alert color="red" icon={<IconAlertCircle size={18} />} title="Cannot analyze sentiment" maw={420}>
              {error}
            </Alert>
          )}
        </Stack>
      )}
    </ContentBlock>
  );
}
