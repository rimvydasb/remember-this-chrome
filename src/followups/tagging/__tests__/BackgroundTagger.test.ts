import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../../../shared/settings';
import type { SavedItem } from '../../../shared/types';
import { makeItem } from '../../../test/items';
import { BackgroundTagger, type BackgroundTaggerDeps } from '../BackgroundTagger';

const settings = DEFAULT_SETTINGS.llm;
const flush = () => vi.advanceTimersByTimeAsync(0);

function setup(items: SavedItem[], overrides: Partial<BackgroundTaggerDeps> = {}) {
  const tagged: string[] = [];
  const current: (string | undefined)[] = [];
  const deps: BackgroundTaggerDeps = {
    settings,
    pipeline: {
      needsTags: (item) => !tagged.includes(item.id),
      run: vi.fn(async ({ item }) => void tagged.push(item.id)),
    },
    hasPermission: async () => true,
    isReachable: async () => true,
    getItems: () => items,
    getPriorityId: () => undefined,
    onCurrent: (id) => current.push(id),
    retryMs: 1000,
    log: () => {},
    ...overrides,
  };
  return { tagger: new BackgroundTagger(deps), deps, tagged, current };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('BackgroundTagger', () => {
  it('tags every item that needs it, in library order, and reports the current item', async () => {
    const items = [makeItem({ id: 'a' }), makeItem({ id: 'b' })];
    const { tagger, tagged, current } = setup(items);
    tagger.start();
    await flush();
    expect(tagged).toEqual(['a', 'b']);
    expect(current).toEqual(['a', 'b', undefined]);
  });

  it('reports its progress as done of total, and the end of the run', async () => {
    const items = [
      makeItem({ id: 'a', title: 'A' }),
      makeItem({ id: 'b', title: 'B' }),
      makeItem({ id: 'c', title: 'C' }),
    ];
    const progress: (string | undefined)[] = [];
    const calls: boolean[] = [];
    const { tagger } = setup(items, {
      onProgress: (p) => progress.push(p && `${p.item.id} ${p.done}/${p.total}`),
      onCall: (ok) => calls.push(ok),
    });
    tagger.start();
    await flush();
    expect(progress).toEqual(['a 0/3', 'b 1/3', 'c 2/3', undefined]);
    expect(calls).toEqual([true, true, true]);
  });

  it('tags the priority item first', async () => {
    const items = [makeItem({ id: 'a' }), makeItem({ id: 'b' })];
    const { tagger, tagged } = setup(items, { getPriorityId: () => 'b' });
    tagger.start();
    await flush();
    expect(tagged).toEqual(['b', 'a']);
  });

  it('pauses without permission and tries again after the retry delay', async () => {
    let allowed = false;
    const { tagger, tagged } = setup([makeItem({ id: 'a' })], { hasPermission: async () => allowed });
    tagger.start();
    await flush();
    expect(tagged).toEqual([]);

    allowed = true;
    await vi.advanceTimersByTimeAsync(1000);
    expect(tagged).toEqual(['a']);
  });

  it('skips an item that fails while the server answers, and logs it', async () => {
    const log = vi.fn();
    const items = [makeItem({ id: 'bad' }), makeItem({ id: 'good' })];
    const run = vi.fn(async ({ item }: { item: SavedItem }) => {
      if (item.id === 'bad') throw new Error('no tags');
    });
    const { tagger } = setup(items, { pipeline: { needsTags: () => true, run }, log });
    tagger.start();
    await flush();
    expect(run.mock.calls.filter(([{ item }]) => item.id === 'bad')).toHaveLength(1);
    expect(log).toHaveBeenCalledOnce();
  });

  it('pauses instead of skipping when the failure comes from an unreachable server', async () => {
    const run = vi.fn(async () => {
      throw new Error('offline');
    });
    let reachable = true;
    const { tagger } = setup([makeItem({ id: 'a' })], {
      pipeline: { needsTags: () => true, run },
      isReachable: async () => {
        const answer = reachable;
        reachable = false;
        return answer;
      },
    });
    tagger.start();
    await flush();
    expect(run).toHaveBeenCalledTimes(1);
    reachable = true;
    await vi.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('wakes up for new items and stops for good', async () => {
    const items = [makeItem({ id: 'a' })];
    const { tagger, tagged } = setup(items);
    tagger.start();
    await flush();
    items.push(makeItem({ id: 'b' }));
    tagger.wake();
    await flush();
    expect(tagged).toEqual(['a', 'b']);

    tagger.stop();
    items.push(makeItem({ id: 'c' }));
    tagger.wake();
    await flush();
    expect(tagged).toEqual(['a', 'b']);
  });
});
