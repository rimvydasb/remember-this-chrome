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
import {
  IconAlertCircle,
  IconChartLine,
  IconMessageCircle,
  IconMoodSmile,
  IconNews,
  IconRefresh,
  IconStar,
  IconTrash,
  type Icon,
} from '@tabler/icons-react';
import { sentimentPipeline } from '../../../../followups/services';
import {
  parseSentiments,
  SENTIMENT_CATEGORIES,
  type SentimentCategory,
  type SentimentDefinition,
  type SentimentMood,
} from '../../../../shared/sentiment';
import type { SavedItem } from '../../../../shared/types';
import { formatDateTime } from '../../../ui/format';
import { ContentBlock } from '../../ContentBlock';
import { useSentiment } from './useSentiment';

/** The icon of each kind of sentiment. */
export const CATEGORY_ICONS: Readonly<Record<SentimentCategory, Icon>> = {
  market: IconChartLine,
  news: IconNews,
  opinion: IconMessageCircle,
  review: IconStar,
  tone: IconMoodSmile,
};

/** The tag color of each mood, from green (positive) to red (negative). */
export const MOOD_COLORS: Readonly<Record<SentimentMood, string>> = {
  positive: 'green',
  'leaning-positive': 'lime',
  neutral: 'gray',
  mixed: 'yellow',
  'leaning-negative': 'orange',
  negative: 'red',
};

/**
 * One sentiment as a tag: the icon of its kind and the color of its mood. The `tag` look matches
 * the keyword tags, so that sentiments sit among them in the reader header.
 */
export function SentimentBadge({
  sentiment,
  size = 'lg',
  tag = false,
}: {
  sentiment: SentimentDefinition;
  size?: MantineSize;
  tag?: boolean;
}) {
  const CategoryIcon = CATEGORY_ICONS[sentiment.category];
  const small = size === 'xs' || size === 'sm';
  return (
    <Tooltip label={`${SENTIMENT_CATEGORIES[sentiment.category].name} sentiment`} withArrow>
      <Badge
        variant="light"
        color={MOOD_COLORS[sentiment.mood]}
        size={size}
        radius={tag ? 'sm' : undefined}
        fw={tag ? 500 : undefined}
        tt="none"
        leftSection={<CategoryIcon size={size === 'xs' ? 10 : small ? 12 : 14} />}
        data-mood={sentiment.mood}
      >
        {sentiment.label}
      </Badge>
    </Tooltip>
  );
}

/** The current sentiments of an item as tags, to place among the keyword tags; nothing when there are none. */
export function SentimentTags({ item, size = 'sm' }: { item: SavedItem; size?: MantineSize }) {
  const sentiment = sentimentPipeline.current(item);
  const sentiments = sentiment ? parseSentiments(sentiment.generatedContent) : [];
  return sentiments.map((entry) => <SentimentBadge key={entry.label} sentiment={entry} size={size} tag />);
}

/** The AI sentiment of an item as tags, or an empty block with a button to analyze it. */
export function Sentiment({ item }: { item: SavedItem }) {
  const { sentiment, sentiments, generating, error, canGenerate, generate, remove } = useSentiment(item);

  const actions = sentiment && (
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
      count={sentiment ? sentiments.length : undefined}
      actions={actions}
    >
      {sentiment ? (
        <Stack gap="sm">
          <Group gap="xs">
            {sentiments.map((entry) => (
              <SentimentBadge key={entry.label} sentiment={entry} />
            ))}
          </Group>
          <Text size="xs" c="dimmed">
            Generated {formatDateTime(sentiment.createdAt)}
            {sentiment.model ? ` · ${sentiment.model}` : ''}
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
