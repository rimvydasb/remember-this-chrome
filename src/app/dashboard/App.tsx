import { Button, Center, Loader, Text } from '@mantine/core';
import { useHotkeys, useLocalStorage } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { RECENTS, RECENTS_ID } from '../../shared/catalogs';
import { ImportError, parseImport, type ParsedImport } from '../../shared/importExport';
import { ITEM_TYPES } from '../../shared/types';
import { AppHeader } from './AppHeader';
import { ITEM_DRAG_TYPE } from './catalogActions';
import { CatalogsHome } from './CatalogsHome';
import { CatalogView } from './CatalogView';
import { EmptyLibrary } from './EmptyLibrary';
import { ActiveFilters, FilterPanel } from './FilterPanel';
import { ImportDialog } from './ImportDialog';
import { ItemList } from './ItemList';
import { ItemReader } from './ItemReader';
import { ListToolbar } from './ListToolbar';
import { Sidebar } from './Sidebar';
import { useAiTagging } from './useAiTagging';
import { useCatalogIndex } from './useCatalogIndex';
import { useCatalogs } from './useCatalogs';
import { useKeywordIndex } from './useKeywordIndex';
import { useLibrary } from './useLibrary';
import { useLibraryFilters, type MarkFilter } from './useLibraryFilters';

/**
 * Where the dashboard is. The URL hash holds it, so the browser's back button and deep links work:
 * `#` is the Catalogs home, `#catalog=<id>` a catalog, `#item=<id>` or `#catalog=<id>&item=<id>` an
 * item. `catalog` also limits the list to that catalog.
 */
interface Route {
  catalogId?: string;
  itemId?: string;
}

function readRoute(): Route {
  const params = new URLSearchParams(location.hash.slice(1));
  return { catalogId: params.get('catalog') ?? undefined, itemId: params.get('item') ?? undefined };
}

function routeUrl(route: Route): string {
  const params = new URLSearchParams();
  if (route.catalogId) params.set('catalog', route.catalogId);
  if (route.itemId) params.set('item', route.itemId);
  const hash = params.toString();
  return hash ? `#${hash}` : location.pathname + location.search;
}

const NO_CATALOGS = [RECENTS];

export function App() {
  const items = useLibrary();
  const all = useMemo(() => items ?? [], [items]);
  const loadedCatalogs = useCatalogs();
  const catalogs = loadedCatalogs ?? NO_CATALOGS;
  const { catalogOf, stats: catalogStats } = useCatalogIndex(all, catalogs);
  const [route, setRoute] = useState<Route>(readRoute);

  const scopeCatalog = catalogs.find((catalog) => catalog.id === route.catalogId);
  const scopeId = scopeCatalog?.id;
  const scoped = useMemo(
    () => (scopeId ? all.filter((item) => catalogOf.get(item.id) === scopeId) : all),
    [all, catalogOf, scopeId],
  );

  const { index: keywordIndex, ready: keywordsReady } = useKeywordIndex(all);
  const filters = useLibraryFilters(scoped, keywordIndex);
  const { filtered, terms } = filters;

  const [checked, setChecked] = useState<Set<string>>(() => new Set());
  const [pendingImport, setPendingImport] = useState<{ fileName: string; parsed: ParsedImport } | null>(null);
  const [sideCollapsed, setSideCollapsed] = useLocalStorage({ key: 'rt-side-collapsed', defaultValue: false });
  const [filtersOpen, setFiltersOpen] = useLocalStorage({ key: 'rt-filters-open', defaultValue: true });
  const searchRef = useRef<HTMLInputElement>(null);

  // The item stays open when a search or filter hides it, or when it moves to another catalog.
  const selected = route.itemId ? all.find((item) => item.id === route.itemId) : undefined;
  const selectedCatalog = selected
    ? (catalogs.find((catalog) => catalog.id === catalogOf.get(selected.id)) ?? RECENTS)
    : undefined;
  const aiTaggingId = useAiTagging(all, selected?.id);
  const checkedItems = useMemo(() => all.filter((item) => checked.has(item.id)), [all, checked]);
  const checkedCatalogIds = new Set(checkedItems.map((item) => catalogOf.get(item.id)));
  const checkedCatalogId = checkedCatalogIds.size === 1 ? [...checkedCatalogIds][0] : undefined;

  // In the all-catalogs list, rows tell which catalog they are in (Recents goes without saying).
  const catalogLabels = useMemo(() => {
    if (scopeId) return undefined;
    const names = new Map(catalogs.map((catalog) => [catalog.id, catalog.name]));
    const labels = new Map<string, string>();
    for (const [itemId, catalogId] of catalogOf) {
      if (catalogId !== RECENTS_ID) labels.set(itemId, names.get(catalogId)!);
    }
    return labels;
  }, [scopeId, catalogs, catalogOf]);
  const types = useMemo(() => ITEM_TYPES.filter((type) => all.some((item) => item.type === type)), [all]);
  const narrowed = terms.length > 0 || filters.activeCount > 0;

  // Back and forward buttons, and deep links from the popup: dashboard.html#item=<id>
  useEffect(() => {
    const onChange = () => setRoute(readRoute());
    window.addEventListener('hashchange', onChange);
    window.addEventListener('popstate', onChange);
    return () => {
      window.removeEventListener('hashchange', onChange);
      window.removeEventListener('popstate', onChange);
    };
  }, []);

  const navigate = useCallback((next: Route, options: { replace?: boolean } = {}) => {
    setRoute(next);
    if (options.replace) history.replaceState(null, '', routeUrl(next));
    else history.pushState(null, '', routeUrl(next));
    document.querySelector('.rt-main')?.scrollTo?.({ top: 0 });
    window.scrollTo({ top: 0 });
  }, []);

  const goHome = useCallback(() => navigate({}), [navigate]);
  const selectMark = useCallback(
    (mark: MarkFilter) => {
      filters.setMark(mark);
      navigate({ itemId: readRoute().itemId });
    },
    [filters, navigate],
  );
  const openCatalog = useCallback((catalogId: string) => navigate({ catalogId }), [navigate]);

  // Rows can be dragged onto a catalog card. Dragging a checked row drags every checked item.
  const checkedRef = useRef(checked);
  useEffect(() => {
    checkedRef.current = checked;
  }, [checked]);
  const startDrag = useCallback((id: string, event: DragEvent) => {
    const ids = checkedRef.current.has(id) ? [...checkedRef.current] : [id];
    event.dataTransfer.setData(ITEM_DRAG_TYPE, JSON.stringify(ids));
    event.dataTransfer.effectAllowed = 'move';
  }, []);

  // Drop selections of items that no longer exist.
  useEffect(() => {
    setChecked((previous) => {
      const ids = new Set(all.map((item) => item.id));
      const next = new Set([...previous].filter((id) => ids.has(id)));
      return next.size === previous.size ? previous : next;
    });
  }, [all]);

  // Going from item to item replaces the history entry, so Back returns to the catalog or home.
  const routeItemId = route.itemId;
  const select = useCallback(
    (id: string) => navigate({ catalogId: scopeId, itemId: id }, { replace: routeItemId !== undefined }),
    [navigate, scopeId, routeItemId],
  );

  const toggleChecked = useCallback((id: string) => {
    setChecked((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAllVisible = () => {
    const allVisibleChecked = filtered.length > 0 && filtered.every((item) => checked.has(item.id));
    setChecked((previous) => {
      const next = new Set(previous);
      for (const item of filtered) {
        if (allVisibleChecked) next.delete(item.id);
        else next.add(item.id);
      }
      return next;
    });
  };

  const moveSelection = (delta: number) => {
    if (filtered.length === 0) return;
    const current = selected ? filtered.indexOf(selected) : -1;
    const next = filtered[Math.min(filtered.length - 1, Math.max(0, current + delta))];
    if (!next) return;
    select(next.id);
    document.querySelector(`[data-item-id="${CSS.escape(next.id)}"]`)?.scrollIntoView({ block: 'nearest' });
  };

  useHotkeys([
    ['/', () => searchRef.current?.focus()],
    ['mod+K', () => searchRef.current?.focus()],
    ['ArrowDown', () => moveSelection(1)],
    ['ArrowUp', () => moveSelection(-1)],
    ['J', () => moveSelection(1)],
    ['K', () => moveSelection(-1)],
    ['F', () => setFiltersOpen((open) => !open)],
  ]);

  const handleImportFile = async (file: File | null) => {
    if (!file) return;
    try {
      setPendingImport({ fileName: file.name, parsed: parseImport(await file.text()) });
    } catch (error) {
      notifications.show({
        color: 'red',
        title: 'Cannot import this file',
        message: error instanceof ImportError ? error.message : String(error),
      });
    }
  };

  const resetAll = () => {
    filters.setQuery('');
    filters.clearFilters();
  };

  return (
    <div className="rt-app" data-side-collapsed={sideCollapsed || undefined}>
      <AppHeader
        all={all}
        query={filters.query}
        onQueryChange={filters.setQuery}
        searchRef={searchRef}
        onImport={handleImportFile}
        onHome={goHome}
      />

      <div className="rt-cols">
        <Sidebar
          all={all}
          catalogs={catalogs}
          catalogStats={catalogStats}
          scopeId={scopeId}
          mark={filters.mark}
          onMark={selectMark}
          onOpenCatalog={openCatalog}
          collapsed={sideCollapsed}
          onToggleCollapsed={() => setSideCollapsed((collapsed) => !collapsed)}
        />

        <section className="rt-list" aria-label="Items">
          <ListToolbar
            total={all.length}
            visible={filtered}
            checked={checked}
            checkedItems={checkedItems}
            onToggleAllVisible={toggleAllVisible}
            onClearChecked={() => setChecked(new Set())}
            busy={filters.query !== filters.deferredQuery || !keywordsReady}
            narrowed={narrowed}
            filtersOpen={filtersOpen}
            onToggleFilters={() => setFiltersOpen((open) => !open)}
            catalogs={catalogs}
            checkedCatalogId={checkedCatalogId}
          />

          {all.length > 0 && filtersOpen && (
            <FilterPanel filters={filters} types={types} keywordsReady={keywordsReady} />
          )}
          {all.length > 0 && <ActiveFilters filters={filters} keywordIndex={keywordIndex} />}

          <div className="rt-rows">
            {items !== null && filtered.length === 0 && all.length > 0 && (
              <div className="rt-list-empty">
                <Text size="sm" c="dimmed" ta="center">
                  No items match{filters.deferredQuery ? ` “${filters.deferredQuery}”` : ''}
                  {filters.activeCount > 0 ? ' with these filters' : ''}.
                </Text>
                <Button size="sm" variant="default" onClick={resetAll}>
                  Reset search and filters
                </Button>
              </div>
            )}
            <ItemList
              items={filtered}
              searchIndex={filters.searchIndex}
              keywordIndex={keywordIndex}
              terms={terms}
              activeKeywords={filters.keywords}
              selectedId={selected?.id}
              checked={checked}
              onSelect={select}
              onToggle={toggleChecked}
              onToggleKeyword={filters.toggleKeyword}
              catalogLabels={catalogLabels}
              onDragStart={startDrag}
            />
          </div>
        </section>

        <main className="rt-reader-col rt-main">
          {items === null || loadedCatalogs === null ? (
            <Center h="60vh">
              <Loader />
            </Center>
          ) : selected && selectedCatalog ? (
            <ItemReader
              key={selected.id}
              item={selected}
              terms={terms}
              keywords={keywordIndex.get(selected.id)}
              activeKeywords={filters.keywords}
              onToggleKeyword={filters.toggleKeyword}
              aiTagging={aiTaggingId === selected.id}
              catalogs={catalogs}
              catalog={selectedCatalog}
              onHome={goHome}
              onOpenCatalog={openCatalog}
            />
          ) : all.length === 0 ? (
            <EmptyLibrary onImport={handleImportFile} />
          ) : scopeCatalog ? (
            <CatalogView
              catalog={scopeCatalog}
              catalogs={catalogs}
              stats={catalogStats.get(scopeCatalog.id)}
              items={filtered}
              narrowed={narrowed}
              onHome={goHome}
              onOpenItem={select}
              onResetFilters={resetAll}
            />
          ) : (
            <CatalogsHome catalogs={catalogs} stats={catalogStats} onOpen={openCatalog} />
          )}
        </main>
      </div>

      {pendingImport && (
        <ImportDialog
          fileName={pendingImport.fileName}
          parsed={pendingImport.parsed}
          libraryCount={all.length}
          onClose={() => setPendingImport(null)}
        />
      )}
    </div>
  );
}
