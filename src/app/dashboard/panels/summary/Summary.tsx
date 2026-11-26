import { ActionIcon, Alert, Button, Stack, Text, ThemeIcon, Tooltip } from '@mantine/core';
import { IconAlertCircle, IconRefresh, IconSparkles, IconTrash } from '@tabler/icons-react';
import type { SavedItem } from '../../../../shared/types';
import { formatDateTime } from '../../../ui/format';
import { ContentBlock } from '../../ContentBlock';
import { LlmMarkdown } from '../common/llmUi';
import { useSummary } from './useSummary';

/** The AI summary of an item, or an empty block with a button to generate one. */
export function Summary({ item }: { item: SavedItem }) {
  const { summary, generating, error, canGenerate, generate, remove } = useSummary(item);

  const actions = summary && (
    <>
      <Tooltip label="Regenerate summary" withArrow>
        <ActionIcon
          variant="subtle"
          color="gray"
          aria-label="Regenerate summary"
          loading={generating}
          disabled={!canGenerate}
          onClick={() => void generate()}
        >
          <IconRefresh size={16} />
        </ActionIcon>
      </Tooltip>
      <Tooltip label="Delete summary" withArrow>
        <ActionIcon variant="subtle" color="red" aria-label="Delete summary" onClick={remove}>
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
          <ThemeIcon variant="light" color="navy" size={40} radius="xl">
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
            color="navy"
            leftSection={<IconSparkles size={15} />}
            loading={generating}
            disabled={!canGenerate}
            onClick={() => void generate()}
          >
            Generate summary
          </Button>
          {error && (
            <Alert color="red" icon={<IconAlertCircle size={18} />} title="Cannot summarize" maw={420}>
              {error}
            </Alert>
          )}
        </Stack>
      )}
    </ContentBlock>
  );
}
