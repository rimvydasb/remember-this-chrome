import { AppShell, Button, Center, Collapse, EmptyState, Loader, ScrollArea, Stack, Text } from '@mantine/core';
import { useDisclosure, useHotkeys, useLocalStorage } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconSearchOff } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ImportError, parseImport, type ParsedImport } from '../shared/importExport';
import { ITEM_TYPES } from '../shared/types';
import { AppHeader } from './AppHeader';
import { EmptyLibrary } from './EmptyLibrary';
import { ActiveFilters, FilterPanel } from './FilterPanel';
import { ImportDialog } from './ImportDialog';
import { ItemList } from './ItemList';
import { ItemReader } from './ItemReader';
import { ListToolbar } from './ListToolbar';
import { useAiTagging } from './useAiTagging';
import { useKeywordIndex } from './useKeywordIndex';
import { useLibrary } from './useLibrary';
import { useLibraryFilters } from './useLibraryFilters';

function itemIdFromHash(): string | undefined {
  const match = /item=([^&]+)/.exec(location.hash);
  return match ? decodeURIComponent(match[1]!) : undefined;
}

export function App() {
  const items = useLibrary();
  const all = useMemo(() => items ?? [], [items]);
  const { index: keywordIndex, ready: keywordsReady } = useKeywordIndex(all);
  const filters = useLibraryFilters(all, keywordIndex);
  const { filtered, terms } = filters;

  const [selectedId, setSelectedId] = useState<string | undefined>(itemIdFromHash);
  const [checked, setChecked] = useState<Set<string>>(() => new Set());
  const [pendingImport, setPendingImport] = useState<{ fileName: string; parsed: ParsedImport } | null>(null);
  const [navOpened, { toggle: toggleNav, close: closeNav }] = useDisclosure(false);
  const [filtersOpen, setFiltersOpen] = useLocalStorage({ key: 'rt-filters-open', defaultValue: true });
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = filtered.find((item) => item.id === selectedId) ?? filtered[0];
  const aiTaggingId = useAiTagging(all, selected?.id);
  const checkedItems = useMemo(() => all.filter((item) => checked.has(item.id)), [all, checked]);
  const types = useMemo(() => ITEM_TYPES.filter((type) => all.some((item) => item.type === type)), [all]);
  const narrowed = terms.length > 0 || filters.activeCount > 0;

  // Deep links from the popup: dashboard.html#item=<id>
  useEffect(() => {
    const onHashChange = () => setSelectedId(itemIdFromHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // Drop selections of items that no longer exist.
  useEffect(() => {
    setChecked((previous) => {
      const ids = new Set(all.map((item) => item.id));
      const next = new Set([...previous].filter((id) => ids.has(id)));
      return next.size === previous.size ? previous : next;
    });
  }, [all]);

  const select = useCallback(
    (id: string) => {
      setSelectedId(id);
      history.replaceState(null, '', `#item=${encodeURIComponent(id)}`);
      closeNav();
      document.querySelector('.rt-main')?.scrollTo?.({ top: 0 });
      window.scrollTo({ top: 0 });
    },
    [closeNav],
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
    <AppShell
      header={{ height: 64 }}
      navbar={{ width: { base: 340, lg: 400 }, breakpoint: 'sm', collapsed: { mobile: !navOpened } }}
      padding={0}
    >
      <AppShell.Header px="md">
        <AppHeader
          all={all}
          query={filters.query}
          onQueryChange={filters.setQuery}
          searchRef={searchRef}
          navOpened={navOpened}
          onToggleNav={toggleNav}
          onImport={handleImportFile}
        />
      </AppShell.Header>

      <AppShell.Navbar>
        <AppShell.Section className="rt-list-toolbar">
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
            activeFilters={filters.activeCount}
            onToggleFilters={() => setFiltersOpen((open) => !open)}
          />
        </AppShell.Section>

        {all.length > 0 && (
          <AppShell.Section className="rt-filters-section">
            <Collapse expanded={filtersOpen}>
              <ScrollArea.Autosize mah="45vh" scrollbarSize={6} type="hover">
                <FilterPanel filters={filters} types={types} keywordsReady={keywordsReady} />
              </ScrollArea.Autosize>
            </Collapse>
            {!filtersOpen && <ActiveFilters filters={filters} keywordIndex={keywordIndex} />}
          </AppShell.Section>
        )}

        <AppShell.Section grow component={ScrollArea} scrollbarSize={8}>
          {items !== null && filtered.length === 0 && all.length > 0 && (
            <Stack align="center" gap="xs" p="xl">
              <Text size="sm" c="dimmed" ta="center">
                No items match{filters.deferredQuery ? ` “${filters.deferredQuery}”` : ''}
                {filters.activeCount > 0 ? ' with these filters' : ''}.
              </Text>
              <Button size="compact-xs" variant="subtle" onClick={resetAll}>
                Reset search and filters
              </Button>
            </Stack>
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
          />
        </AppShell.Section>
      </AppShell.Navbar>

      <AppShell.Main className="rt-main">
        <div className="rt-main-inner">
          {items === null ? (
            <Center h="60vh">
              <Loader />
            </Center>
          ) : all.length === 0 ? (
            <EmptyLibrary onImport={handleImportFile} />
          ) : !selected ? (
            <Center h="60vh">
              <EmptyState
                icon={<IconSearchOff size={28} />}
                title="Nothing found"
                description="Try different words, put a phrase in double quotes, or remove a filter."
              />
            </Center>
          ) : (
            <ItemReader
              key={selected.id}
              item={selected}
              terms={terms}
              keywords={keywordIndex.get(selected.id)}
              activeKeywords={filters.keywords}
              onToggleKeyword={filters.toggleKeyword}
              aiTagging={aiTaggingId === selected.id}
            />
          )}
        </div>
      </AppShell.Main>

      {pendingImport && (
        <ImportDialog
          fileName={pendingImport.fileName}
          parsed={pendingImport.parsed}
          libraryCount={all.length}
          onClose={() => setPendingImport(null)}
        />
      )}
    </AppShell>
  );
}
