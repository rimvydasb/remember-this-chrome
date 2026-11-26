import { ActionIcon, Alert, Button, Group, Stack, Text, ThemeIcon, Tooltip } from '@mantine/core';
import { IconAlertCircle, IconMoodSmile, IconRefresh, IconTrash } from '@tabler/icons-react';
import { SENTIMENT_CATEGORIES, type SentimentDefinition } from '../../../../shared/sentiment';
import type { SavedItem } from '../../../../shared/types';
import { formatDateTime } from '../../../ui/format';
import { GeneratingNote } from '../../ActivityBar';
import { ContentBlock } from '../../ContentBlock';
import { CATEGORY_ICONS, MOOD_COLORS } from '../../sentimentStyle';
import { Chip } from '../../../ui/Chip';
import { useSentiment } from './useSentiment';

/** One sentiment as a chip: the icon of its kind and the color of its mood. */
export function SentimentBadge({ sentiment }: { sentiment: SentimentDefinition }) {
  const CategoryIcon = CATEGORY_ICONS[sentiment.category];
  return (
    <Tooltip label={`${SENTIMENT_CATEGORIES[sentiment.category].name} sentiment`} withArrow>
      <Chip color={MOOD_COLORS[sentiment.mood]} icon={<CategoryIcon size={12} />} data-mood={sentiment.mood}>
        {sentiment.label}
      </Chip>
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
          {generating && <GeneratingNote label="Regenerating" />}
          <Group gap={4}>
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
          <ThemeIcon variant="light" size={40} radius="xl">
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
            leftSection={<IconMoodSmile size={15} />}
            loading={generating}
            disabled={!canGenerate}
            onClick={() => void generate()}
          >
            Analyze sentiment
          </Button>
          {generating && <GeneratingNote label="Analyzing" />}
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
