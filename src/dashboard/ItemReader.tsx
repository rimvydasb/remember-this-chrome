import {
  ActionIcon,
  Anchor,
  Badge,
  Button,
  CopyButton,
  Divider,
  Group,
  Highlight,
  Stack,
  Text,
  Title,
  Tooltip,
  Typography,
} from '@mantine/core';
import {
  IconCalendar,
  IconClipboard,
  IconClipboardCheck,
  IconClock,
  IconExternalLink,
  IconMarkdown,
  IconTrash,
  IconUser,
} from '@tabler/icons-react';
import { useMemo } from 'react';
import { formatDuration, TYPE_LABELS } from '../shared/markdown';
import { countWords } from '../shared/transcript';
import type { Keyword } from '../shared/keywords';
import type { SavedItem } from '../shared/types';
import { formatDateTime, formatNumber, readingTime } from '../ui/format';
import { confirmDelete, exportMarkdown } from './actions';
import { KeywordBadges } from './KeywordBadges';

interface ItemReaderProps {
  item: SavedItem;
  terms: readonly string[];
  keywords: readonly Keyword[] | undefined;
  activeKeywords: ReadonlySet<string>;
  onToggleKeyword: (key: string) => void;
}

function countMatches(text: string, terms: readonly string[]): number {
  const lower = text.toLowerCase();
  let total = 0;
  for (const term of terms) {
    for (let at = lower.indexOf(term); at !== -1; at = lower.indexOf(term, at + term.length)) total++;
  }
  return total;
}

export function ItemReader({ item, terms, keywords, activeKeywords, onToggleKeyword }: ItemReaderProps) {
  const paragraphs = useMemo(() => item.content.split(/\n{2,}/), [item.content]);
  const words = useMemo(() => countWords(item.content), [item.content]);
  const matches = useMemo(() => (terms.length ? countMatches(item.content, terms) : 0), [item.content, terms]);
  const highlight = terms as string[];

  return (
    <Stack gap="lg" maw={760} mx="auto" pb="xl">
      <Stack gap="sm">
        <Group gap="xs">
          <Badge variant="light" color={item.type === 'youtube_transcript' ? 'red' : 'blue'}>
            {TYPE_LABELS[item.type]}
          </Badge>
          {item.meta?.language && (
            <Badge variant="light" color="gray">
              {item.meta.language}
            </Badge>
          )}
          {terms.length > 0 && (
            <Badge variant="light" color="yellow">
              {matches} {matches === 1 ? 'match' : 'matches'}
            </Badge>
          )}
        </Group>

        <Title order={2} lh={1.25}>
          <Highlight highlight={highlight} inherit>
            {item.title || 'Untitled'}
          </Highlight>
        </Title>

        <Group gap="lg" c="dimmed">
          {item.meta?.channel && <Meta icon={<IconUser size={15} />}>{item.meta.channel}</Meta>}
          <Meta icon={<IconCalendar size={15} />}>Saved {formatDateTime(item.timestamp)}</Meta>
          <Meta icon={<IconClock size={15} />}>
            {formatNumber(words)} words · {readingTime(words)}
            {item.meta?.durationSec ? ` · ${formatDuration(item.meta.durationSec)} video` : ''}
          </Meta>
        </Group>

        {keywords && keywords.length > 0 && (
          <KeywordBadges keywords={keywords} active={activeKeywords} onToggle={onToggleKeyword} size="sm" />
        )}

        <Group gap="xs" mt={4}>
          <CopyButton value={item.content} timeout={2000}>
            {({ copied, copy }) => (
              <Button
                size="xs"
                variant={copied ? 'filled' : 'light'}
                color={copied ? 'teal' : undefined}
                leftSection={copied ? <IconClipboardCheck size={15} /> : <IconClipboard size={15} />}
                onClick={copy}
              >
                {copied ? 'Copied' : 'Copy text'}
              </Button>
            )}
          </CopyButton>
          <Button
            size="xs"
            variant="default"
            leftSection={<IconMarkdown size={16} />}
            onClick={() => exportMarkdown([item])}
          >
            Export Markdown
          </Button>
          <Button
            size="xs"
            variant="default"
            component="a"
            href={item.url}
            target="_blank"
            rel="noreferrer"
            leftSection={<IconExternalLink size={15} />}
          >
            Open source
          </Button>
          <Tooltip label="Delete" withArrow>
            <ActionIcon variant="subtle" color="red" aria-label="Delete item" onClick={() => confirmDelete([item])}>
              <IconTrash size={17} />
            </ActionIcon>
          </Tooltip>
        </Group>
        <Anchor href={item.url} target="_blank" rel="noreferrer" size="xs" c="dimmed" truncate="end">
          {item.url}
        </Anchor>
      </Stack>

      <Divider />

      <Typography className="rt-reader">
        {paragraphs.map((paragraph, i) =>
          highlight.length ? (
            <Highlight key={i} component="p" highlight={highlight} inherit>
              {paragraph}
            </Highlight>
          ) : (
            <p key={i}>{paragraph}</p>
          ),
        )}
      </Typography>
    </Stack>
  );
}

function Meta({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Group gap={6} wrap="nowrap">
      {icon}
      <Text size="sm" c="dimmed">
        {children}
      </Text>
    </Group>
  );
}
