import { IconChartLine, IconMessageCircle, IconMoodSmile, IconNews, IconStar, type Icon } from '@tabler/icons-react';
import type { SentimentCategory, SentimentMood } from '../../shared/sentiment';
import type { ChipColor } from '../ui/Chip';

/** The icon of each kind of sentiment. */
export const CATEGORY_ICONS: Readonly<Record<SentimentCategory, Icon>> = {
  market: IconChartLine,
  news: IconNews,
  opinion: IconMessageCircle,
  review: IconStar,
  tone: IconMoodSmile,
};

/** The tag color of each mood, from green (positive) to red (negative). */
export const MOOD_COLORS: Readonly<Record<SentimentMood, ChipColor>> = {
  positive: 'green',
  'leaning-positive': 'lime',
  neutral: 'gray',
  mixed: 'yellow',
  'leaning-negative': 'orange',
  negative: 'red',
};
