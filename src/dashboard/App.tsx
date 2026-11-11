import {
  ActionIcon,
  AppShell,
  Burger,
  Button,
  Center,
  Checkbox,
  CloseButton,
  EmptyState,
  FileButton,
  Group,
  Kbd,
  Loader,
  Menu,
  ScrollArea,
  Text,
  TextInput,
  Tooltip,
  useComputedColorScheme,
  useMantineColorScheme,
} from '@mantine/core';
import { useDisclosure, useHotkeys } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import {
  IconBookmark,
  IconBrandYoutube,
  IconDots,
  IconDownload,
  IconMarkdown,
  IconMoon,
  IconSearch,
  IconSearchOff,
  IconSun,
  IconTrash,
  IconUpload,
} from '@tabler/icons-react';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { ImportError, parseImport, type ParsedImport } from '../shared/importExport';
import { buildSearchIndex, filterItems, parseQuery, type SearchIndex } from '../shared/search';
import { Logo } from '../ui/Logo';
import { formatNumber } from '../ui/format';
import { confirmClearLibrary, confirmDelete, exportLibraryJson, exportMarkdown } from './actions';
import { ImportDialog } from './ImportDialog';
import { ItemList } from './ItemList';
import { ItemReader } from './ItemReader';
import { useLibrary } from './useLibrary';

function itemIdFromHash(): string | undefined {
  const match = /item=([^&]+)/.exec(location.hash);
  return match ? decodeURIComponent(match[1]!) : undefined;
}

export function App() {
  const items = useLibrary();
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [selectedId, setSelectedId] = useState<string | undefined>(itemIdFromHash);
  const [checked, setChecked] = useState<Set<string>>(() => new Set());
  const [pendingImport, setPendingImport] = useState<{ fileName: string; parsed: ParsedImport } | null>(null);
  const [navOpened, { toggle: toggleNav, close: closeNav }] = useDisclosure(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const indexRef = useRef<SearchIndex | undefined>(undefined);
  const { setColorScheme } = useMantineColorScheme();
  const colorScheme = useComputedColorScheme('light');

  const all = useMemo(() => items ?? [], [items]);
  const index = useMemo(() => (indexRef.current = buildSearchIndex(all, indexRef.current)), [all]);
  const terms = useMemo(() => parseQuery(deferredQuery), [deferredQuery]);
  const filtered = useMemo(() => filterItems(all, index, terms), [all, index, terms]);
  const selected = filtered.find((item) => item.id === selectedId) ?? filtered[0];
  const checkedItems = useMemo(() => all.filter((item) => checked.has(item.id)), [all, checked]);

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

  const allVisibleChecked = filtered.length > 0 && filtered.every((item) => checked.has(item.id));
  const someVisibleChecked = filtered.some((item) => checked.has(item.id));
  const toggleAllVisible = () => {
    setChecked((previous) => {
      const next = new Set(previous);
      for (const item of filtered) {
        if (allVisibleChecked) next.delete(item.id);
        else next.add(item.id);
      }
      return next;
    });
  };

  return (
    <AppShell
      header={{ height: 64 }}
      navbar={{ width: { base: 340, lg: 400 }, breakpoint: 'sm', collapsed: { mobile: !navOpened } }}
      padding={0}
    >
      <AppShell.Header px="md">
        <Group h="100%" justify="space-between" wrap="nowrap" gap="md">
          <Group gap="sm" wrap="nowrap" style={{ flexShrink: 0 }}>
            <Burger opened={navOpened} onClick={toggleNav} hiddenFrom="sm" size="sm" aria-label="Toggle list" />
            <Logo />
          </Group>

          <TextInput
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setQuery('');
                event.currentTarget.blur();
              }
            }}
            placeholder="Search titles and transcripts…"
            aria-label="Search library"
            leftSection={<IconSearch size={16} />}
            rightSectionWidth={query ? 36 : 44}
            rightSection={
              query ? (
                <CloseButton size="sm" aria-label="Clear search" onClick={() => setQuery('')} />
              ) : (
                <Kbd size="xs">/</Kbd>
              )
            }
            radius="xl"
            style={{ flex: 1, maxWidth: 560 }}
          />

          <Group gap="xs" wrap="nowrap" style={{ flexShrink: 0 }}>
            <FileButton onChange={handleImportFile} accept="application/json,.json">
              {(props) => (
                <Button {...props} variant="default" size="sm" leftSection={<IconUpload size={16} />} visibleFrom="md">
                  Import JSON
                </Button>
              )}
            </FileButton>
            <Button
              variant="light"
              size="sm"
              leftSection={<IconDownload size={16} />}
              onClick={exportLibraryJson}
              disabled={all.length === 0}
              visibleFrom="md"
            >
              Export JSON
            </Button>
            <Tooltip label={colorScheme === 'dark' ? 'Light mode' : 'Dark mode'} withArrow>
              <ActionIcon
                variant="default"
                size="lg"
                aria-label="Toggle color scheme"
                onClick={() => setColorScheme(colorScheme === 'dark' ? 'light' : 'dark')}
              >
                {colorScheme === 'dark' ? <IconSun size={18} /> : <IconMoon size={18} />}
              </ActionIcon>
            </Tooltip>
            <Menu position="bottom-end" width={230} withArrow>
              <Menu.Target>
                <ActionIcon variant="default" size="lg" aria-label="More actions">
                  <IconDots size={18} />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Label>Library</Menu.Label>
                <FileButton onChange={handleImportFile} accept="application/json,.json">
                  {(props) => (
                    <Menu.Item {...props} leftSection={<IconUpload size={16} />}>
                      Import JSON…
                    </Menu.Item>
                  )}
                </FileButton>
                <Menu.Item
                  leftSection={<IconDownload size={16} />}
                  onClick={exportLibraryJson}
                  disabled={all.length === 0}
                >
                  Export JSON
                </Menu.Item>
                <Menu.Item
                  leftSection={<IconMarkdown size={16} />}
                  onClick={() => exportMarkdown(all.filter((item) => item.type === 'youtube_transcript'))}
                  disabled={all.length === 0}
                >
                  Export all transcripts as Markdown
                </Menu.Item>
                <Menu.Divider />
                <Menu.Item
                  color="red"
                  leftSection={<IconTrash size={16} />}
                  onClick={() => confirmClearLibrary(all.length)}
                  disabled={all.length === 0}
                >
                  Clear library…
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar>
        <AppShell.Section className="rt-list-toolbar">
          {checked.size > 0 ? (
            <Group justify="space-between" wrap="nowrap" gap="xs">
              <Group gap="xs" wrap="nowrap">
                <Checkbox
                  size="xs"
                  checked={allVisibleChecked}
                  indeterminate={!allVisibleChecked && someVisibleChecked}
                  onChange={toggleAllVisible}
                  aria-label="Select all visible items"
                />
                <Text size="sm" fw={600}>
                  {checked.size} selected
                </Text>
              </Group>
              <Group gap={4} wrap="nowrap">
                <Button
                  size="compact-xs"
                  variant="light"
                  leftSection={<IconMarkdown size={14} />}
                  onClick={() => exportMarkdown(checkedItems)}
                >
                  Markdown
                </Button>
                <Button
                  size="compact-xs"
                  variant="light"
                  color="red"
                  leftSection={<IconTrash size={14} />}
                  onClick={() => confirmDelete(checkedItems, () => setChecked(new Set()))}
                >
                  Delete
                </Button>
                <CloseButton size="sm" aria-label="Clear selection" onClick={() => setChecked(new Set())} />
              </Group>
            </Group>
          ) : (
            <Group justify="space-between" wrap="nowrap">
              <Group gap="xs" wrap="nowrap">
                <Checkbox
                  size="xs"
                  checked={false}
                  disabled={filtered.length === 0}
                  onChange={toggleAllVisible}
                  aria-label="Select all visible items"
                />
                <Text size="sm" c="dimmed">
                  {terms.length > 0
                    ? `${formatNumber(filtered.length)} of ${formatNumber(all.length)} items`
                    : `${formatNumber(all.length)} ${all.length === 1 ? 'item' : 'items'}`}
                </Text>
              </Group>
              {query !== deferredQuery && <Loader size={14} />}
            </Group>
          )}
        </AppShell.Section>
        <AppShell.Section grow component={ScrollArea} scrollbarSize={8}>
          {items !== null && filtered.length === 0 && all.length > 0 && (
            <Text size="sm" c="dimmed" ta="center" p="xl">
              No items match “{deferredQuery}”.
            </Text>
          )}
          <ItemList
            items={filtered}
            index={index}
            terms={terms}
            selectedId={selected?.id}
            checked={checked}
            onSelect={select}
            onToggle={toggleChecked}
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
                description="Try different words, or put a phrase in double quotes."
              />
            </Center>
          ) : (
            <ItemReader key={selected.id} item={selected} terms={terms} />
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

function EmptyLibrary({ onImport }: { onImport: (file: File | null) => void }) {
  return (
    <Center h="70vh">
      <EmptyState
        icon={<IconBookmark size={30} />}
        title="Your library is empty"
        description={
          <>
            Open a YouTube video, click the <b>Remember This</b> toolbar button, and choose <b>Save transcript</b>. Or
            press <Kbd size="xs">Alt</Kbd> + <Kbd size="xs">Shift</Kbd> + <Kbd size="xs">S</Kbd> on the video page.
          </>
        }
        maw={460}
      >
        <EmptyState.Actions>
          <Button
            component="a"
            href="https://www.youtube.com/"
            target="_blank"
            rel="noreferrer"
            leftSection={<IconBrandYoutube size={18} />}
          >
            Go to YouTube
          </Button>
          <FileButton onChange={onImport} accept="application/json,.json">
            {(props) => (
              <Button {...props} variant="default" leftSection={<IconUpload size={18} />}>
                Import JSON
              </Button>
            )}
          </FileButton>
        </EmptyState.Actions>
      </EmptyState>
    </Center>
  );
}
