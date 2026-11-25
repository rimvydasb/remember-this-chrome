import { notifications } from '@mantine/notifications';
import { useState } from 'react';
import { ItemDeletedError } from '../../../../followups/errors';
import { questionPipeline } from '../../../../followups/services';
import { errorMessage } from '../../../../llm';
import type { LlmSettings } from '../../../../shared/settings';
import type { FollowUp, SavedItem } from '../../../../shared/types';
import { useLlmGate } from '../common/useLlmGate';

export interface QuestionsState {
  /** The questions, newest first. */
  questions: readonly FollowUp[];
  draft: string;
  setDraft: (text: string) => void;
  canAsk: boolean;
  /** Saves the draft as a question and answers it. */
  ask: () => Promise<void>;
  /** Answers a saved question again (or for the first time, after a failure). */
  retry: (question: FollowUp) => void;
  remove: (question: FollowUp) => void;
  isAnswering: (id: string) => boolean;
  errorOf: (id: string) => string | undefined;
}

/** Updates one key of an immutable set or map held in state. */
function withFlag(previous: ReadonlySet<string>, id: string, on: boolean): ReadonlySet<string> {
  const next = new Set(previous);
  if (on) next.add(id);
  else next.delete(id);
  return next;
}

/** The state and actions of the questions of an item. */
export function useQuestions(item: SavedItem): QuestionsState {
  const gate = useLlmGate();
  const [draft, setDraft] = useState('');
  /** Questions whose answer is being generated. */
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  /** The last error per question. */
  const [errors, setErrors] = useState<ReadonlyMap<string, string>>(new Map());

  const setError = (id: string, message: string | undefined) =>
    setErrors((previous) => {
      const next = new Map(previous);
      if (message === undefined) next.delete(id);
      else next.set(id, message);
      return next;
    });

  /** Generates the answer; the caller starts the permission request inside the click handler. */
  const answer = async (question: FollowUp, llm: LlmSettings, permission: Promise<void>) => {
    setPending((previous) => withFlag(previous, question.id, true));
    setError(question.id, undefined);
    try {
      await permission;
      await questionPipeline.run({ settings: llm, item }, question);
    } catch (error) {
      setError(question.id, errorMessage(error));
    } finally {
      setPending((previous) => withFlag(previous, question.id, false));
    }
  };

  const ask = async () => {
    const text = draft.trim();
    const access = text ? gate.begin() : undefined;
    if (!access) return;
    access.permission.catch(() => {}); // Handled in `answer`.
    // Clear the input first, so a second Enter or click cannot ask the same question twice.
    setDraft('');
    let question: FollowUp;
    try {
      question = await questionPipeline.ask(item, text);
    } catch (error) {
      if (!(error instanceof ItemDeletedError)) throw error;
      setDraft((current) => current || text);
      notifications.show({ color: 'red', message: 'Cannot save the question: the item was deleted.' });
      return;
    }
    await answer(question, access.llm, access.permission);
  };

  return {
    questions: questionPipeline.list(item),
    draft,
    setDraft,
    canAsk: gate.ready,
    ask,
    retry: (question) => {
      const access = gate.begin();
      if (access && question.userContent) void answer(question, access.llm, access.permission);
    },
    remove: (question) => {
      setError(question.id, undefined);
      void questionPipeline.remove(item, question);
    },
    isAnswering: (id) => pending.has(id),
    errorOf: (id) => errors.get(id),
  };
}
