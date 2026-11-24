import { ActionIcon, Alert, Button, Stack, Text, ThemeIcon, Tooltip } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconAlertCircle, IconRefresh, IconSparkles, IconTrash } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { summarize } from '../shared/llm';
import type { LlmSettings } from '../shared/settings';
import { addFollowUp, deleteFollowUp } from '../shared/storage';
import type { FollowUp, SavedItem } from '../shared/types';
import { formatDateTime } from '../ui/format';
import { ContentBlock } from './ContentBlock';
import { ensureLlmPermission, errorText, LlmMarkdown } from './llmUi';
import { useSettings } from './useSettings';

/** The AI summary of an item, or an empty block with a button to generate one. */
export function Summary({ item }: { item: SavedItem }) {
  const settings = useSettings();
  const summaries = (item.followUps ?? []).filter((followUp) => followUp.type === 'llm-summary');
  const summary = summaries.at(-1);

  const mutation = useMutation({
    mutationFn: async (llm: LlmSettings) => {
      const result = await summarize(llm, item);
      const followUp: FollowUp = {
        id: crypto.randomUUID(),
        type: 'llm-summary',
        generatedContent: result.content,
        createdAt: new Date().toISOString(),
      };
      if (result.model) followUp.model = result.model;
      if (!(await addFollowUp(item.id, followUp))) throw new Error('The item was deleted.');
      // A new summary replaces the earlier ones.
      for (const old of summaries) await deleteFollowUp(item.id, old.id);
    },
    onSuccess: () => notifications.show({ color: 'teal', message: `Summary added to “${item.title || 'Untitled'}”.` }),
    onError: (error) =>
      notifications.show({ color: 'red', title: 'Cannot summarize', message: error.message, autoClose: 10_000 }),
  });
  const summarizing = mutation.isPending;

  const generate = async () => {
    if (!settings) return;
    const llm = settings.llm;
    // The permission request must start inside the click handler (user gesture), before any await.
    const permission = ensureLlmPermission(llm.baseUrl);
    try {
      await permission;
    } catch (error) {
      mutation.reset();
      notifications.show({ color: 'red', title: 'Cannot summarize', message: errorText(error) });
      return;
    }
    mutation.mutate(llm);
  };

  const actions = summary && (
    <>
      <Tooltip label="Regenerate summary" withArrow>
        <ActionIcon
          variant="subtle"
          color="gray"
          aria-label="Regenerate summary"
          loading={summarizing}
          disabled={!settings}
          onClick={() => void generate()}
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
    <ContentBlock
      storageKey="summary"
      icon={<IconSparkles size={17} />}
      title="Summary"
      copy={summary ? { value: summary.generatedContent, label: 'Copy summary' } : undefined}
      actions={actions}
    >
      {summary ? (
        <Stack gap="sm">
          <LlmMarkdown>{summary.generatedContent}</LlmMarkdown>
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
            onClick={() => void generate()}
          >
            Generate summary
          </Button>
          {mutation.isError && (
            <Alert color="red" icon={<IconAlertCircle size={18} />} title="Cannot summarize" maw={420}>
              {mutation.error.message}
            </Alert>
          )}
        </Stack>
      )}
    </ContentBlock>
  );
}
