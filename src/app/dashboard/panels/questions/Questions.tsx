import { Button, Group, Kbd, Stack, Text, Textarea } from '@mantine/core';
import { IconMessageQuestion, IconSend2 } from '@tabler/icons-react';
import type { KeyboardEvent } from 'react';
import type { SavedItem } from '../../../../shared/types';
import { ContentBlock } from '../../ContentBlock';
import { QuestionCard } from './QuestionCard';
import { useQuestions } from './useQuestions';

/** Questions of the user about an item, answered by the LLM from the item text. */
export function Questions({ item }: { item: SavedItem }) {
  const { questions, draft, setDraft, canAsk, ask, retry, remove, isAnswering, errorOf } = useQuestions(item);
  const source = item.type === 'youtube_transcript' ? 'transcript' : 'page';

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void ask();
    }
  };

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
              color="navy"
              variant="light"
              leftSection={<IconSend2 size={15} />}
              disabled={!canAsk || draft.trim() === ''}
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

        {questions.map((question) => (
          <QuestionCard
            key={question.id}
            followUp={question}
            answering={isAnswering(question.id)}
            error={errorOf(question.id)}
            canAsk={canAsk}
            onRetry={() => retry(question)}
            onDelete={() => remove(question)}
          />
        ))}
      </Stack>
    </ContentBlock>
  );
}
