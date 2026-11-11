/// <reference lib="webworker" />
import { itemTerms, type ItemTerms } from '../shared/terms';
import type { SavedItem } from '../shared/types';

/**
 * Extracts item terms off the main thread. Part-of-speech tagging of a long transcript takes
 * about 100 ms, which would freeze the dashboard on a large library.
 *
 * A new request replaces the queue of the previous one. Results of the previous request that were
 * already sent stay valid, because they are keyed by item ID and timestamp.
 */

export interface TermJob {
  key: string;
  item: Pick<SavedItem, 'title' | 'content' | 'meta'>;
}

export interface TermRequest {
  request: number;
  jobs: TermJob[];
}

export type TermResponse =
  | { request: number; key: string; terms: ItemTerms }
  | { request: number; key: string; error: string }
  | { request: number; done: true };

declare const self: DedicatedWorkerGlobalScope;

let request = 0;
let queue: TermJob[] = [];
let running = false;

const post = (message: TermResponse) => self.postMessage(message);

function step() {
  const job = queue.shift();
  if (!job) {
    running = false;
    post({ request, done: true });
    return;
  }
  try {
    post({ request, key: job.key, terms: itemTerms(job.item) });
  } catch (error) {
    post({ request, key: job.key, error: String(error) });
  }
  // Yield between items, so a new request can replace the queue.
  setTimeout(step, 0);
}

self.onmessage = (event: MessageEvent<TermRequest>) => {
  request = event.data.request;
  queue = [...event.data.jobs];
  if (!running) {
    running = true;
    step();
  }
};
