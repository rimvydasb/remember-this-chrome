import { ActionIcon, Alert, Button, Group, Kbd, Loader, Stack, Text, Textarea, Tooltip } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconAlertCircle, IconMessageQuestion, IconRefresh, IconSend2, IconTrash } from '@tabler/icons-react';
import { useState, type KeyboardEvent } from 'react';
import { answerQuestion } from '../shared/llm';
import type { LlmSettings } from '../shared/settings';
import { addFollowUp, deleteFollowUp, updateFollowUp } from '../shared/storage';
import type { FollowUp, SavedItem } from '../shared/types';
import { formatDateTime } from '../ui/format';
import { ContentBlock } from './ContentBlock';
import { CopyAction } from './CopyAction';
import { ensureLlmPermission, errorText, LlmMarkdown } from './llmUi';
import { useSettings } from './useSettings';

/**
 * Questions of the user about an item, answered by the LLM from the item text. A question is
 * saved first and answered right after; a question without an answer can be asked again.
 */
export function Questions({ item }: { item: SavedItem }) {
  const settings = useSettings();
  const [draft, setDraft] = useState('');
  /** Questions whose answer is being generated. */
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  /** The last error per question. */
  const [errors, setErrors] = useState<ReadonlyMap<string, string>>(new Map());

  // Newest first, so a new question appears right below the input.
  const questions = (item.followUps ?? []).filter((followUp) => followUp.type === 'user-question').reverse();

  const setError = (id: string, message: string | undefined) =>
    setErrors((previous) => {
      const next = new Map(previous);
      if (message === undefined) next.delete(id);
      else next.set(id, message);
      return next;
    });

  const setPendingFlag = (id: string, on: boolean) =>
    setPending((previous) => {
      const next = new Set(previous);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  /** Generates the answer; `permission` must be requested by the caller inside the click handler. */
  const answer = async (id: string, question: string, llm: LlmSettings, permission: Promise<void>) => {
    setPendingFlag(id, true);
    setError(id, undefined);
    try {
      await permission;
      const result = await answerQuestion(llm, item, { text: question, id });
      const patch: Partial<FollowUp> = { generatedContent: result.content, model: result.model };
      if (!result.model) delete patch.model;
      // False when the question or the item was deleted meanwhile: then the answer is not needed.
      await updateFollowUp(item.id, id, patch);
    } catch (error) {
      setError(id, errorText(error));
    } finally {
      setPendingFlag(id, false);
    }
  };

  const ask = async () => {
    const question = draft.trim();
    if (!question || !settings) return;
    const llm = settings.llm;
    // Starts the permission prompt inside the user gesture, before any await.
    const permission = ensureLlmPermission(llm.baseUrl);
    permission.catch(() => {}); // Handled in `answer`.
    // Clear the input first, so a second Enter or click cannot ask the same question twice.
    setDraft('');

    const followUp: FollowUp = {
      id: crypto.randomUUID(),
      type: 'user-question',
      userContent: question,
      generatedContent: '',
      createdAt: new Date().toISOString(),
    };
    if (!(await addFollowUp(item.id, followUp))) {
      setDraft((current) => current || question);
      notifications.show({ color: 'red', message: 'Cannot save the question: the item was deleted.' });
      return;
    }
    await answer(followUp.id, question, llm, permission);
  };

  const retry = (followUp: FollowUp) => {
    if (!settings || !followUp.userContent) return;
    void answer(followUp.id, followUp.userContent, settings.llm, ensureLlmPermission(settings.llm.baseUrl));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void ask();
    }
  };

  const source = item.type === 'youtube_transcript' ? 'transcript' : 'page';

  return (
    <ContentBlock
      storageKey="questions"
      icon={<IconMessageQuestion size={17} />}
      title="Questions"
      count={questions.length || undefined}
    >
      <Stack gap="md">
        <Stack gap={6}>
          <Group gap="xs" align="flex-end" wrap="nowrap">
            <Textarea
              flex={1}
              aria-label="Your question"
              placeholder={`Ask a question about this ${source}…`}
              autosize
              minRows={1}
              maxRows={6}
              value={draft}
              onChange={(event) => setDraft(event.currentTarget.value)}
              onKeyDown={onKeyDown}
            />
            <Button
              color="violet"
              variant="light"
              leftSection={<IconSend2 size={15} />}
              disabled={!settings || draft.trim() === ''}
              onClick={() => void ask()}
            >
              Ask
            </Button>
          </Group>
          <Text size="xs" c="dimmed">
            The AI answers from the {source} only, as its author would. <Kbd size="xs">Enter</Kbd> asks,{' '}
            <Kbd size="xs">Shift</Kbd> + <Kbd size="xs">Enter</Kbd> adds a line.
          </Text>
        </Stack>

        {questions.map((followUp) => (
          <QuestionCard
            key={followUp.id}
            followUp={followUp}
            answering={pending.has(followUp.id)}
            error={errors.get(followUp.id)}
            canAsk={Boolean(settings)}
            onRetry={() => retry(followUp)}
            onDelete={() => {
              setError(followUp.id, undefined);
              void deleteFollowUp(item.id, followUp.id);
            }}
          />
        ))}
      </Stack>
    </ContentBlock>
  );
}

interface QuestionCardProps {
  followUp: FollowUp;
  answering: boolean;
  error: string | undefined;
  canAsk: boolean;
  onRetry: () => void;
  onDelete: () => void;
}

function QuestionCard({ followUp, answering, error, canAsk, onRetry, onDelete }: QuestionCardProps) {
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
            <Loader size="xs" color="violet" type="dots" />
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
