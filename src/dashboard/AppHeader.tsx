import {
  ActionIcon,
  Burger,
  Button,
  CloseButton,
  FileButton,
  Group,
  Kbd,
  Menu,
  TextInput,
  Tooltip,
  useComputedColorScheme,
  useMantineColorScheme,
} from '@mantine/core';
import {
  IconDots,
  IconDownload,
  IconMarkdown,
  IconMoon,
  IconSearch,
  IconSettings,
  IconSun,
  IconTrash,
  IconUpload,
} from '@tabler/icons-react';
import { useDisclosure } from '@mantine/hooks';
import type { Ref } from 'react';
import type { SavedItem } from '../shared/types';
import { Logo } from '../ui/Logo';
import { confirmClearLibrary, exportLibraryJson, exportMarkdown } from './actions';
import { SettingsDialog } from './SettingsDialog';

interface AppHeaderProps {
  all: readonly SavedItem[];
  query: string;
  onQueryChange: (query: string) => void;
  searchRef: Ref<HTMLInputElement>;
  navOpened: boolean;
  onToggleNav: () => void;
  onImport: (file: File | null) => void;
}

export function AppHeader({ all, query, onQueryChange, searchRef, navOpened, onToggleNav, onImport }: AppHeaderProps) {
  const { setColorScheme } = useMantineColorScheme();
  const colorScheme = useComputedColorScheme('light');
  const empty = all.length === 0;
  const [settingsOpened, { open: openSettings, close: closeSettings }] = useDisclosure(false);

  return (
    <Group h="100%" justify="space-between" wrap="nowrap" gap="md">
      <Group gap="sm" wrap="nowrap" style={{ flexShrink: 0 }}>
        <Burger opened={navOpened} onClick={onToggleNav} hiddenFrom="sm" size="sm" aria-label="Toggle list" />
        <Logo />
      </Group>

      <TextInput
        ref={searchRef}
        value={query}
        onChange={(event) => onQueryChange(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            onQueryChange('');
            event.currentTarget.blur();
          }
        }}
        placeholder="Search titles and transcripts…"
        aria-label="Search library"
        leftSection={<IconSearch size={16} />}
        rightSectionWidth={query ? 36 : 44}
        rightSection={
          query ? (
            <CloseButton size="sm" aria-label="Clear search" onClick={() => onQueryChange('')} />
          ) : (
            <Kbd size="xs">/</Kbd>
          )
        }
        radius="xl"
        style={{ flex: 1, maxWidth: 560 }}
      />

      <Group gap="xs" wrap="nowrap" style={{ flexShrink: 0 }}>
        <FileButton onChange={onImport} accept="application/json,.json">
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
          disabled={empty}
          visibleFrom="md"
        >
          Export JSON
        </Button>
        <Tooltip label="Settings" withArrow>
          <ActionIcon variant="default" size="lg" aria-label="Settings" onClick={openSettings}>
            <IconSettings size={18} />
          </ActionIcon>
        </Tooltip>
        <SettingsDialog opened={settingsOpened} onClose={closeSettings} />
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
            <FileButton onChange={onImport} accept="application/json,.json">
              {(props) => (
                <Menu.Item {...props} leftSection={<IconUpload size={16} />}>
                  Import JSON…
                </Menu.Item>
              )}
            </FileButton>
            <Menu.Item leftSection={<IconDownload size={16} />} onClick={exportLibraryJson} disabled={empty}>
              Export JSON
            </Menu.Item>
            <Menu.Item
              leftSection={<IconMarkdown size={16} />}
              onClick={() => exportMarkdown(all.filter((item) => item.type === 'youtube_transcript'))}
              disabled={empty}
            >
              Export all transcripts as Markdown
            </Menu.Item>
            <Menu.Divider />
            <Menu.Item
              color="red"
              leftSection={<IconTrash size={16} />}
              onClick={() => confirmClearLibrary(all.length)}
              disabled={empty}
            >
              Clear library…
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Group>
    </Group>
  );
}
