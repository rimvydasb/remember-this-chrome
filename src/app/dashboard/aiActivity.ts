import { useSyncExternalStore } from 'react';

/** One piece of AI work on one item, started by the user (summary, answer, …). */
export interface AiTask {
  id: number;
  /** What runs, for the AI panel: "Summarizing", "Answering a question". */
  label: string;
  /** The item it works on. */
  itemTitle: string;
  startedAt: number;
}

/** The background tagging run: `done` of `total` items, and the item being tagged now. */
export interface TaggingJob {
  done: number;
  total: number;
  itemTitle: string;
}

export interface LastCall {
  at: number;
  ok: boolean;
}

export interface AiActivity {
  tasks: readonly AiTask[];
  tagging: TaggingJob | undefined;
  /** True while the user has paused background tagging (this session only). */
  taggingPaused: boolean;
  /** The end of the last AI request, from any source. */
  lastCall: LastCall | undefined;
}

let state: AiActivity = { tasks: [], tagging: undefined, taggingPaused: false, lastCall: undefined };
let nextId = 1;
const listeners = new Set<() => void>();

function set(patch: Partial<AiActivity>): void {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The AI work of the dashboard, as one store that the header pill and its panel read. */
export const aiActivity = {
  get: (): AiActivity => state,
  subscribe,

  /**
   * Runs `work` as a visible AI task: it shows in the header until it settles, and its outcome
   * becomes the last call. The result or error of `work` is passed through.
   */
  async track<T>(label: string, itemTitle: string, work: () => Promise<T>): Promise<T> {
    const task: AiTask = { id: nextId++, label, itemTitle: itemTitle || 'Untitled', startedAt: Date.now() };
    set({ tasks: [...state.tasks, task] });
    let ok = false;
    try {
      const result = await work();
      ok = true;
      return result;
    } finally {
      set({ tasks: state.tasks.filter((other) => other.id !== task.id), lastCall: { at: Date.now(), ok } });
    }
  },

  setTagging(job: TaggingJob | undefined): void {
    if (job === state.tagging) return;
    set({ tagging: job });
  },

  /** Records a tagging request that ended. */
  recordCall(ok: boolean): void {
    set({ lastCall: { at: Date.now(), ok } });
  },

  setTaggingPaused(paused: boolean): void {
    if (paused !== state.taggingPaused) set({ taggingPaused: paused });
  },

  /** Back to the start; for tests. */
  reset(): void {
    state = { tasks: [], tagging: undefined, taggingPaused: false, lastCall: undefined };
    for (const listener of listeners) listener();
  },
};

export function useAiActivity(): AiActivity {
  return useSyncExternalStore(subscribe, aiActivity.get, aiActivity.get);
}
