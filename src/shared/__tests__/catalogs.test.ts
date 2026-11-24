import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeChrome, type FakeChrome } from '../../test/fakeChrome';
import {
  catalogIdOf,
  catalogNameError,
  CATALOGS_KEY,
  mergeCatalogs,
  normalizeCatalogs,
  RECENTS,
  RECENTS_ID,
  type Catalog,
} from '../catalogs';
import { buildExportPayload, parseImport } from '../importExport';
import {
  applyImport,
  createCatalog,
  deleteCatalog,
  getAllItems,
  getCatalogs,
  getItem,
  moveItemsToCatalog,
  putItems,
  renameCatalog,
} from '../storage';
import type { SavedItem } from '../types';

const item = (id: string, extra: Partial<SavedItem> = {}): SavedItem => ({
  id,
  title: `Title ${id}`,
  url: `https://www.youtube.com/watch?v=${id}`,
  type: 'youtube_transcript',
  content: `Content ${id}`,
  timestamp: '2026-01-01T00:00:00.000Z',
  ...extra,
});

const catalog = (id: string, name: string): Catalog => ({ id, name, createdAt: '2026-01-01T00:00:00.000Z' });

describe('catalogs', () => {
  it('always puts Recents first and sorts the rest by name', () => {
    expect(normalizeCatalogs(undefined)).toEqual([RECENTS]);
    const result = normalizeCatalogs([catalog('b', 'work'), catalog('a', 'Cooking'), { id: 'x' }, catalog('a', 'Dup')]);
    expect(result.map((c) => c.name)).toEqual(['Recents', 'Cooking', 'work']);
  });

  it('never accepts a stored catalog with the Recents ID', () => {
    expect(normalizeCatalogs([catalog(RECENTS_ID, 'Inbox')])).toEqual([RECENTS]);
  });

  it('puts items without a known catalog in Recents', () => {
    const ids = new Set([RECENTS_ID, 'a']);
    expect(catalogIdOf(item('1'), ids)).toBe(RECENTS_ID);
    expect(catalogIdOf(item('2', { catalogId: 'a' }), ids)).toBe('a');
    expect(catalogIdOf(item('3', { catalogId: 'gone' }), ids)).toBe(RECENTS_ID);
  });

  it('validates names', () => {
    const all = [RECENTS, catalog('a', 'Cooking')];
    expect(catalogNameError('  ', all)).toBe('Enter a name');
    expect(catalogNameError('recents', all)).toMatch(/already exists/);
    expect(catalogNameError('COOKING', all)).toMatch(/already exists/);
    expect(catalogNameError('Cooking', all, 'a')).toBeNull();
    expect(catalogNameError('x'.repeat(61), all)).toMatch(/at most/);
    expect(catalogNameError('Work', all)).toBeNull();
  });

  it('merges imported catalogs, joining same-named ones', () => {
    const existing = [catalog('a', 'Cooking')];
    const incoming = [catalog('a', 'Cooking'), catalog('b', 'cooking'), catalog('c', 'Work'), catalog('d', 'Recents')];
    const { catalogs, remap } = mergeCatalogs(existing, incoming, 'merge');
    expect(catalogs.map((c) => c.id)).toEqual(['a', 'c']);
    expect([...remap]).toEqual([
      ['b', 'a'],
      ['d', RECENTS_ID],
    ]);
    expect(mergeCatalogs(existing, [catalog('c', 'Work')], 'replace').catalogs.map((c) => c.id)).toEqual(['c']);
  });

  it('round-trips catalogs through export and import', () => {
    const payload = buildExportPayload([item('1', { catalogId: 'a' })], new Date(), [RECENTS, catalog('a', 'Cooking')]);
    expect(payload.catalogs).toEqual([catalog('a', 'Cooking')]);
    const parsed = parseImport(JSON.stringify(payload));
    expect(parsed.catalogs).toEqual([catalog('a', 'Cooking')]);
    expect(parsed.items[0]!.catalogId).toBe('a');
    expect(buildExportPayload([], new Date()).catalogs).toBeUndefined();
    expect(parseImport(JSON.stringify([item('1')])).catalogs).toEqual([]);
  });
});

describe('catalog storage', () => {
  let chrome: FakeChrome;

  beforeEach(() => {
    chrome = createFakeChrome();
    vi.stubGlobal('chrome', chrome);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('creates, renames, and stores catalogs without Recents', async () => {
    const work = await createCatalog('  Work ');
    await renameCatalog(work.id, 'Job');
    await renameCatalog(RECENTS_ID, 'Inbox');
    expect((await getCatalogs()).map((c) => c.name)).toEqual(['Recents', 'Job']);
    expect(chrome.storage.local.store.get(CATALOGS_KEY)).toEqual([{ ...work, name: 'Job' }]);
  });

  it('moves items between catalogs; moving to Recents removes the field', async () => {
    const work = await createCatalog('Work');
    await putItems([item('1'), item('2')]);
    await moveItemsToCatalog(['1', '2', 'missing'], work.id);
    expect((await getItem('1'))!.catalogId).toBe(work.id);
    await moveItemsToCatalog(['1'], RECENTS_ID);
    expect(await getItem('1')).toEqual(item('1'));
  });

  it('deletes a catalog and moves its items to Recents; Recents cannot be deleted', async () => {
    const work = await createCatalog('Work');
    await putItems([item('1', { catalogId: work.id }), item('2')]);
    expect(await deleteCatalog(RECENTS_ID)).toBe(0);
    expect(await deleteCatalog(work.id)).toBe(1);
    expect(await getCatalogs()).toEqual([RECENTS]);
    expect((await getAllItems()).every((i) => i.catalogId === undefined)).toBe(true);
  });

  it('remaps imported items to a same-named stored catalog', async () => {
    const cooking = await createCatalog('Cooking');
    await applyImport([item('1', { catalogId: 'other' })], 'merge', [catalog('other', 'cooking')]);
    expect((await getItem('1'))!.catalogId).toBe(cooking.id);
    expect(await getCatalogs()).toEqual([RECENTS, cooking]);
  });
});
