import {
  ActionIcon,
  Badge,
  Button,
  CopyButton,
  Group,
  Paper,
  Stack,
  Text,
  Title,
  Tooltip,
  Typography,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconClipboard, IconClipboardCheck, IconSparkles, IconSubtask, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import { LlmError, requestLlmPermission, summarize } from '../shared/llm';
import { addFollowUp, deleteFollowUp } from '../shared/storage';
import type { FollowUp, FollowUpType, SavedItem } from '../shared/types';
import { formatDateTime } from '../ui/format';
import { useSettings } from './useSettings';

/** Element ID of the follow-ups section, for the "Jump to follow-ups" button. */
export const FOLLOW_UPS_ANCHOR = 'rt-follow-ups';

const FOLLOW_UP_LABELS: Record<FollowUpType, string> = {
  'llm-summary': 'Summary',
};

/** Follow-up actions for an item, and the follow-ups it already has (newest first). */
export function FollowUps({ item }: { item: SavedItem }) {
  const settings = useSettings();
  const [summarizing, setSummarizing] = useState(false);
  const followUps = [...(item.followUps ?? [])].reverse();

  const runSummarize = () => {
    if (!settings) return;
    const llm = settings.llm;
    // The permission request must start inside the click handler (user gesture).
    const permission = requestLlmPermission(llm.baseUrl);
    setSummarizing(true);
    permission
      .then(async (granted) => {
        if (!granted) throw new LlmError(`Permission to access ${llm.baseUrl} was denied.`);
        const result = await summarize(llm, item.title, item.content);
        const followUp: FollowUp = {
          id: crypto.randomUUID(),
          type: 'llm-summary',
          content: result.content,
          createdAt: new Date().toISOString(),
        };
        if (result.model) followUp.model = result.model;
        if (!(await addFollowUp(item.id, followUp))) throw new Error('The item was deleted.');
        notifications.show({ color: 'teal', message: `Summary added to “${item.title || 'Untitled'}”.` });
      })
      .catch((error: unknown) => {
        notifications.show({
          color: 'red',
          title: 'Cannot summarize',
          message: error instanceof Error ? error.message : String(error),
          autoClose: 10_000,
        });
      })
      .finally(() => setSummarizing(false));
  };

  return (
    <Stack gap="md" component="section" id={FOLLOW_UPS_ANCHOR} style={{ scrollMarginTop: 80 }}>
      <Group gap={8} c="dimmed">
        <IconSubtask size={17} />
        <Title order={4} size="h6" tt="uppercase" fw={600} lts={0.4}>
          Follow-ups
        </Title>
        {followUps.length > 0 && (
          <Badge size="xs" variant="light" color="gray">
            {followUps.length}
          </Badge>
        )}
      </Group>

      <Group gap="xs">
        <Button
          size="xs"
          variant="light"
          leftSection={<IconSparkles size={15} />}
          loading={summarizing}
          disabled={!settings}
          onClick={runSummarize}
        >
          Summarize
        </Button>
      </Group>

      {followUps.map((followUp) => (
        <FollowUpCard key={followUp.id} itemId={item.id} followUp={followUp} />
      ))}
    </Stack>
  );
}

function FollowUpCard({ itemId, followUp }: { itemId: string; followUp: FollowUp }) {
  const paragraphs = followUp.content.split(/\n{2,}/);
  return (
    <Paper withBorder radius="md" p="md">
      <Stack gap="sm">
        <Group justify="space-between" wrap="nowrap">
          <Group gap="xs">
            <Badge variant="light" color="violet">
              {FOLLOW_UP_LABELS[followUp.type] ?? followUp.type}
            </Badge>
            <Text size="xs" c="dimmed">
              {formatDateTime(followUp.createdAt)}
              {followUp.model ? ` · ${followUp.model}` : ''}
            </Text>
          </Group>
          <Group gap={4} wrap="nowrap">
            <CopyButton value={followUp.content} timeout={2000}>
              {({ copied, copy }) => (
                <Tooltip label={copied ? 'Copied' : 'Copy'} withArrow>
                  <ActionIcon variant="subtle" color={copied ? 'teal' : 'gray'} aria-label="Copy" onClick={copy}>
                    {copied ? <IconClipboardCheck size={16} /> : <IconClipboard size={16} />}
                  </ActionIcon>
                </Tooltip>
              )}
            </CopyButton>
            <Tooltip label="Delete" withArrow>
              <ActionIcon
                variant="subtle"
                color="red"
                aria-label="Delete follow-up"
                onClick={() => deleteFollowUp(itemId, followUp.id)}
              >
                <IconTrash size={16} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>
        <Typography className="rt-reader rt-follow-up">
          {paragraphs.map((paragraph, i) => (
            <p key={i}>{paragraph}</p>
          ))}
        </Typography>
      </Stack>
    </Paper>
  );
}
