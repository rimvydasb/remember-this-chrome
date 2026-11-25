import type { LlmSettings } from '../../shared/settings';
import type { SavedItem } from '../../shared/types';
import type { TaggingPipeline } from './TaggingPipeline';

/** Wait before the next try when the server is not reachable or the permission is missing. */
export const TAGGING_RETRY_MS = 5 * 60_000;

export interface BackgroundTaggerDeps {
  settings: LlmSettings;
  pipeline: Pick<TaggingPipeline, 'needsTags' | 'run'>;
  /** Tells whether the extension may call the server. */
  hasPermission: (baseUrl: string) => Promise<boolean>;
  /** Tells whether the server answers. */
  isReachable: (settings: LlmSettings) => Promise<boolean>;
  /** The current library; read again before each item. */
  getItems: () => readonly SavedItem[];
  /** The item to tag first, usually the open one. */
  getPriorityId: () => string | undefined;
  /** Called with the item being tagged, and with undefined when idle. */
  onCurrent: (itemId: string | undefined) => void;
  retryMs?: number;
  log?: (message: string, error: unknown) => void;
}

/** Tag identity: the item changes when it is captured again. */
const attemptKey = (item: SavedItem) => `${item.id}\u0000${item.timestamp}`;

/**
 * Tags the library one item at a time: the priority item first, then newest first. When the server
 * does not answer, or the permission is missing, it pauses and tries again later. An item whose
 * tagging fails while the server answers is skipped until a new tagger starts or the item changes.
 *
 * It has no UI or React: the dashboard creates it, calls `wake()` when the library changes, and
 * calls `stop()` when it unmounts.
 */
export class BackgroundTagger {
  /** Items tried by this tagger (tagged or failed). */
  private readonly attempted = new Set<string>();
  private stopped = false;
  private running = false;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly deps: BackgroundTaggerDeps) {}

  /** Starts the loop; call `wake()` for later library changes. */
  start(): void {
    void this.run();
  }

  /** Starts the loop when it is idle and not waiting for a retry. */
  wake(): void {
    if (!this.running && !this.timer && !this.stopped) void this.run();
  }

  stop(): void {
    this.stopped = true;
    clearTimeout(this.timer);
    this.timer = undefined;
    this.deps.onCurrent(undefined);
  }

  private next(): SavedItem | undefined {
    const candidates = this.deps
      .getItems()
      .filter((item) => this.deps.pipeline.needsTags(item) && !this.attempted.has(attemptKey(item)));
    const priority = this.deps.getPriorityId();
    return candidates.find((item) => item.id === priority) ?? candidates[0];
  }

  private pause(): void {
    this.timer = setTimeout(() => void this.run(), this.deps.retryMs ?? TAGGING_RETRY_MS);
  }

  private async run(): Promise<void> {
    if (this.running || this.stopped) return;
    const { settings, pipeline, hasPermission, isReachable, onCurrent } = this.deps;
    this.running = true;
    this.timer = undefined;
    try {
      if (!this.next()) return;
      if (!(await hasPermission(settings.baseUrl)) || !(await isReachable(settings))) return this.pause();
      for (let item = this.next(); item && !this.stopped; item = this.next()) {
        onCurrent(item.id);
        try {
          await pipeline.run({ settings, item }, { onlyIfMissing: true });
          // Do not ask for the same item again before the library update arrives.
          this.attempted.add(attemptKey(item));
        } catch (error) {
          if (this.stopped) return;
          if (!(await isReachable(settings))) return this.pause();
          this.deps.log?.(`AI tagging failed for “${item.title}”`, error);
          this.attempted.add(attemptKey(item));
        }
      }
    } finally {
      this.running = false;
      if (!this.stopped) onCurrent(undefined);
    }
  }
}
