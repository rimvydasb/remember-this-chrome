import { ActionIcon, Button, CopyButton, Stack, Text, ThemeIcon, Tooltip, Typography } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconClipboard, IconClipboardCheck, IconRefresh, IconSparkles, IconTrash } from '@tabler/icons-react';
import { Markdown } from '@tanstack/markdown/react';
import { useState, type ComponentPropsWithoutRef } from 'react';
import { LlmError, requestLlmPermission, summarize } from '../shared/llm';
import { addFollowUp, deleteFollowUp } from '../shared/storage';
import type { FollowUp, SavedItem } from '../shared/types';
import { formatDateTime } from '../ui/format';
import { ContentBlock } from './ContentBlock';
import { useSettings } from './useSettings';

/** Links in LLM output open in a new tab, so they do not replace the dashboard. */
const MARKDOWN_COMPONENTS = {
  a: (props: ComponentPropsWithoutRef<'a'>) => <a {...props} target="_blank" rel="noreferrer" />,
};

/** The AI summary of an item, or an empty block with a button to generate one. */
export function Summary({ item }: { item: SavedItem }) {
  const settings = useSettings();
  const [summarizing, setSummarizing] = useState(false);
  const summaries = (item.followUps ?? []).filter((followUp) => followUp.type === 'llm-summary');
  const summary = summaries.at(-1);

  const generate = () => {
    if (!settings) return;
    const llm = settings.llm;
    const previous = summaries;
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
        // A new summary replaces the earlier ones.
        for (const old of previous) await deleteFollowUp(item.id, old.id);
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

  const actions = summary && (
    <>
      <CopyButton value={summary.content} timeout={2000}>
        {({ copied, copy }) => (
          <Tooltip label={copied ? 'Copied' : 'Copy summary'} withArrow>
            <ActionIcon variant="subtle" color={copied ? 'teal' : 'gray'} aria-label="Copy summary" onClick={copy}>
              {copied ? <IconClipboardCheck size={16} /> : <IconClipboard size={16} />}
            </ActionIcon>
          </Tooltip>
        )}
      </CopyButton>
      <Tooltip label="Regenerate summary" withArrow>
        <ActionIcon
          variant="subtle"
          color="gray"
          aria-label="Regenerate summary"
          loading={summarizing}
          disabled={!settings}
          onClick={generate}
        >
          <IconRefresh size={16} />
        </ActionIcon>
      </Tooltip>
      <Tooltip label="Delete summary" withArrow>
        <ActionIcon
          variant="subtle"
          color="red"
          aria-label="Delete summary"
          onClick={() => deleteFollowUp(item.id, summary.id)}
        >
          <IconTrash size={16} />
        </ActionIcon>
      </Tooltip>
    </>
  );

  return (
    <ContentBlock storageKey="summary" icon={<IconSparkles size={17} />} title="Summary" actions={actions}>
      {summary ? (
        <Stack gap="sm">
          <Typography className="rt-reader rt-follow-up">
            <Markdown components={MARKDOWN_COMPONENTS}>{summary.content}</Markdown>
          </Typography>
          <Text size="xs" c="dimmed">
            Generated {formatDateTime(summary.createdAt)}
            {summary.model ? ` · ${summary.model}` : ''}
          </Text>
        </Stack>
      ) : (
        <Stack align="center" gap="xs" py="md" className="rt-summary-empty">
          <ThemeIcon variant="light" color="violet" size={40} radius="xl">
            <IconSparkles size={20} />
          </ThemeIcon>
          <Text size="sm" fw={500}>
            No summary yet
          </Text>
          <Text size="xs" c="dimmed" ta="center" maw={360}>
            Let AI read the {item.type === 'youtube_transcript' ? 'transcript' : 'page'} and write a short summary.
          </Text>
          <Button
            mt={4}
            size="xs"
            variant="light"
            color="violet"
            leftSection={<IconSparkles size={15} />}
            loading={summarizing}
            disabled={!settings}
            onClick={generate}
          >
            Generate summary
          </Button>
        </Stack>
      )}
    </ContentBlock>
  );
}
