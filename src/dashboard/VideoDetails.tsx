import { Anchor, Badge, Group, Paper, Spoiler, Stack, Text, Title, UnstyledButton } from '@mantine/core';
import { IconExternalLink, IconLink, IconListNumbers, IconAlignLeft } from '@tabler/icons-react';
import { useMemo } from 'react';
import { formatDuration } from '../shared/markdown';
import type { SavedItem, VideoChapter, VideoLink } from '../shared/types';
import { chapterUrl, splitLinks } from '../shared/videoDetails';
import { getYouTubeVideoId } from '../shared/youtube';

/** Chapters, mentioned links, and the description of a captured video. Renders nothing when there are none. */
export function VideoDetails({ item }: { item: SavedItem }) {
  const meta = item.meta;
  const videoId = meta?.videoId ?? getYouTubeVideoId(item.url);
  const chapters = meta?.chapters ?? [];
  const links = meta?.links ?? [];
  const description = meta?.description?.trim();
  if (chapters.length === 0 && links.length === 0 && !description) return null;

  return (
    <Stack gap="lg">
      {chapters.length > 0 && (
        <Section icon={<IconListNumbers size={17} />} title="Chapters" count={chapters.length}>
          <ChapterList chapters={chapters} videoId={videoId} durationSec={meta?.durationSec} />
        </Section>
      )}
      {links.length > 0 && (
        <Section icon={<IconLink size={17} />} title="Links" count={links.length}>
          <LinkList links={links} />
        </Section>
      )}
      {description && (
        <Section icon={<IconAlignLeft size={17} />} title="Description">
          <Description text={description} />
        </Section>
      )}
    </Stack>
  );
}

function Section({
  icon,
  title,
  count,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <Stack gap="xs" component="section">
      <Group gap={8} c="dimmed">
        {icon}
        <Title order={4} size="h6" tt="uppercase" fw={600} lts={0.4}>
          {title}
        </Title>
        {count !== undefined && (
          <Badge size="xs" variant="light" color="gray">
            {count}
          </Badge>
        )}
      </Group>
      {children}
    </Stack>
  );
}

function ChapterList({
  chapters,
  videoId,
  durationSec,
}: {
  chapters: readonly VideoChapter[];
  videoId: string | null;
  durationSec: number | undefined;
}) {
  return (
    <Paper withBorder radius="md" className="rt-detail-list">
      {chapters.map((chapter, i) => {
        const end = chapters[i + 1]?.startSec ?? durationSec;
        const length = end !== undefined && end > chapter.startSec ? formatDuration(end - chapter.startSec) : undefined;
        const content = (
          <Group gap="sm" wrap="nowrap" className="rt-detail-row">
            <Badge variant="light" radius="sm" className="rt-timestamp">
              {formatDuration(chapter.startSec)}
            </Badge>
            <Text size="sm" style={{ flex: 1 }} lineClamp={2}>
              {chapter.title}
            </Text>
            {length && (
              <Text size="xs" c="dimmed" className="rt-tabular">
                {length}
              </Text>
            )}
          </Group>
        );
        return videoId ? (
          <UnstyledButton
            key={chapter.startSec}
            component="a"
            href={chapterUrl(videoId, chapter.startSec)}
            target="_blank"
            rel="noreferrer"
            className="rt-detail-link"
            title={`Play from ${formatDuration(chapter.startSec)}`}
          >
            {content}
          </UnstyledButton>
        ) : (
          <div key={chapter.startSec}>{content}</div>
        );
      })}
    </Paper>
  );
}

function displayUrl(url: string): { host: string; rest: string } {
  try {
    const parsed = new URL(url);
    const rest = `${parsed.pathname === '/' ? '' : parsed.pathname}${parsed.search}${parsed.hash}`;
    return { host: parsed.hostname.replace(/^www\./, ''), rest };
  } catch {
    return { host: url, rest: '' };
  }
}

function LinkList({ links }: { links: readonly VideoLink[] }) {
  return (
    <Paper withBorder radius="md" className="rt-detail-list">
      {links.map((link) => {
        const { host, rest } = displayUrl(link.url);
        return (
          <UnstyledButton
            key={link.url}
            component="a"
            href={link.url}
            target="_blank"
            rel="noreferrer"
            className="rt-detail-link"
            title={link.url}
          >
            <Group gap="sm" wrap="nowrap" className="rt-detail-row">
              <IconExternalLink size={16} style={{ flexShrink: 0, opacity: 0.6 }} />
              <Stack gap={0} style={{ minWidth: 0, flex: 1 }}>
                {link.label && (
                  <Text size="sm" fw={500} truncate="end">
                    {link.label}
                  </Text>
                )}
                <Text size={link.label ? 'xs' : 'sm'} c={link.label ? 'dimmed' : undefined} truncate="end">
                  <Text span inherit fw={600}>
                    {host}
                  </Text>
                  {rest}
                </Text>
              </Stack>
            </Group>
          </UnstyledButton>
        );
      })}
    </Paper>
  );
}

function Description({ text }: { text: string }) {
  const parts = useMemo(() => splitLinks(text), [text]);
  return (
    <Spoiler maxHeight={150} showLabel="Show more" hideLabel="Show less">
      <Text size="sm" className="rt-description">
        {parts.map((part, i) =>
          part.url ? (
            <Anchor key={i} href={part.url} target="_blank" rel="noreferrer" inherit>
              {part.text}
            </Anchor>
          ) : (
            part.text
          ),
        )}
      </Text>
    </Spoiler>
  );
}
