import { ActionIcon, Alert, Group, Loader, Stack, Text, Tooltip } from '@mantine/core';
import { IconAlertCircle, IconRefresh, IconTrash } from '@tabler/icons-react';
import type { FollowUp } from '../../../../shared/types';
import { formatDateTime } from '../../../ui/format';
import { CopyAction } from '../../CopyAction';
import { LlmMarkdown } from '../common/llmUi';

interface QuestionCardProps {
  followUp: FollowUp;
  answering: boolean;
  error: string | undefined;
  canAsk: boolean;
  onRetry: () => void;
  onDelete: () => void;
}

export function QuestionCard({ followUp, answering, error, canAsk, onRetry, onDelete }: QuestionCardProps) {
  const answered = followUp.generatedContent.trim() !== '';
  return (
    <div className="rt-question">
      <Group gap="xs" wrap="nowrap" align="flex-start" className="rt-question-head">
        <Text fw={600} size="sm" flex={1} className="rt-question-text">
          {followUp.userContent}
        </Text>
        <Group gap={2} wrap="nowrap">
          {answered && <CopyAction value={followUp.generatedContent} label="Copy answer" />}
          {!answering && (
            <Tooltip label={answered ? 'Answer again' : 'Get answer'} withArrow>
              <ActionIcon
                variant="subtle"
                color="gray"
                aria-label={answered ? 'Answer again' : 'Get answer'}
                disabled={!canAsk}
                onClick={onRetry}
              >
                <IconRefresh size={16} />
              </ActionIcon>
            </Tooltip>
          )}
          <Tooltip label="Delete question" withArrow>
            <ActionIcon variant="subtle" color="red" aria-label="Delete question" onClick={onDelete}>
              <IconTrash size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      <div className="rt-question-answer">
        {answering ? (
          <Group gap="xs">
            <Loader size="xs" type="dots" />
            <Text size="sm" c="dimmed">
              {answered ? 'Answering again…' : 'Answering…'}
            </Text>
          </Group>
        ) : answered ? (
          <Stack gap={6}>
            <LlmMarkdown>{followUp.generatedContent}</LlmMarkdown>
            <Text size="xs" c="dimmed">
              Asked {formatDateTime(followUp.createdAt)}
              {followUp.model ? ` · ${followUp.model}` : ''}
            </Text>
          </Stack>
        ) : (
          !error && (
            <Text size="sm" c="dimmed">
              No answer yet.
            </Text>
          )
        )}
        {error && !answering && (
          <Alert color="red" icon={<IconAlertCircle size={18} />} title="Cannot answer" mt={answered ? 'xs' : 0}>
            {error}
          </Alert>
        )}
      </div>
    </div>
  );
}
